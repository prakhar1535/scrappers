const puppeteer = require("puppeteer");
const fs = require("fs").promises;

async function scrapeMenu(url) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const readMoreSpans = document.querySelectorAll(
          "span.sc-eLpfTy.fDJZgR"
        );
        readMoreSpans.forEach((span) => {
          if (span.textContent.includes("read more")) {
            span.click();
          }
        });
        setTimeout(resolve, 1000);
      });
    });

    await page.evaluate(() => {
      const images = document.querySelectorAll("img.sc-s1isp7-5");
      console.log("Found images:", images.length);
      images.forEach((img) => {
        console.log("Image src:", img.getAttribute("src"));
      });
    });

    const menuData = await page.evaluate(() => {
      function cleanImageUrl(url) {
        if (!url) return null;
        const jpgMatch = url.match(/(.*?\.jpg)/);
        return jpgMatch ? jpgMatch[1] : url;
      }

      function cleanPrice(price) {
        if (!price) return null;
        return price.replace("AED", "").trim();
      }

      const menu = [];
      const allElements = document.querySelectorAll(
        "h4.sc-1hp8d8a-0, .sc-bsBFbB.iDOlyD"
      );
      let currentSection = null;
      let currentItems = [];

      allElements.forEach((element) => {
        if (element.tagName.toLowerCase() === "h4") {
          if (currentSection) {
            menu.push({
              section: currentSection,
              items: currentItems,
            });
          }
          currentSection = element.textContent.trim();
          currentItems = [];
        } else {
          console.log("Processing element:", element.outerHTML);

          const category = element
            .querySelector(".sc-1hez2tp-0.sc-fguZLD.caWawD")
            ?.textContent.trim();

          const typeDiv = element.querySelector(".sc-jRTQlX");
          const itemType = typeDiv ? typeDiv.getAttribute("type") : "veg";

          const title = element.querySelector(".sc-gsxalj")?.textContent.trim();
          const description = element
            .querySelector(".sc-bPzAnn.dRgPyk")
            ?.textContent.trim();

          let imageUrl = null;
          try {
            const imgContainer = element.querySelector(".sc-s1isp7-1.kmRBaC");
            if (imgContainer) {
              const img = imgContainer.querySelector("img");
              if (img) {
                imageUrl =
                  img.getAttribute("src") ||
                  img.getAttribute("data-src") ||
                  window
                    .getComputedStyle(img)
                    .backgroundImage?.replace(/^url\(['"](.+)['"]\)/, "$1") ||
                  null;

                if (imageUrl === window.location.href) {
                  imageUrl = null;
                }
              }
            }

            if (!imageUrl) {
              const imgElement = element.querySelector(
                'img[class*="sc-s1isp7-5"]'
              );
              if (imgElement) {
                imageUrl = imgElement.getAttribute("src") || imgElement.src;
                if (imageUrl === window.location.href) {
                  imageUrl = null;
                }
              }
            }

            // Clean the image URL
            imageUrl = cleanImageUrl(imageUrl);
            console.log("Found image URL:", imageUrl);
          } catch (error) {
            console.log("Error finding image:", error);
          }

          let price = null;
          for (let i = 1; i <= 10; i++) {
            const priceElement = element.querySelector(`.sc-17hyc2s-${i}`);
            if (priceElement) {
              price = cleanPrice(priceElement.textContent.trim());
              break;
            }
          }

          currentItems.push({
            category,
            title,
            description,
            price,
            type: itemType,
            isNonVeg: itemType === "non-veg",
            imageUrl: imageUrl,
          });
        }
      });

      if (currentSection) {
        menu.push({
          section: currentSection,
          items: currentItems,
        });
      }

      return menu;
    });

    const result = {
      timestamp: new Date().toISOString(),
      url: url,
      menu: menuData,
      stats: {
        totalItems: menuData.reduce(
          (acc, section) => acc + section.items.length,
          0
        ),
        vegItems: menuData.reduce(
          (acc, section) =>
            acc + section.items.filter((item) => item.type === "veg").length,
          0
        ),
        nonVegItems: menuData.reduce(
          (acc, section) =>
            acc +
            section.items.filter((item) => item.type === "non-veg").length,
          0
        ),
        itemsWithImages: menuData.reduce(
          (acc, section) =>
            acc + section.items.filter((item) => item.imageUrl !== null).length,
          0
        ),
      },
    };

    await fs.writeFile("menu_data_3.json", JSON.stringify(result, null, 2));
    console.log("Menu data saved to menu_data3.json");

    return result;
  } catch (error) {
    console.error("Scraping failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

const url =
  process.argv[2] || "https://www.zomato.com/dubai/melenzane-1-al-safa/order";
scrapeMenu(url).catch(console.error);

const puppeteer = require("puppeteer");
const fs = require("fs").promises;

async function scrapeGoogleReviews(placeUrl) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("Navigating to reviews page...");
    await page.goto(placeUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for reviews section to load
    await page.waitForSelector(".jftiEf");

    console.log("Starting to scrape reviews...");
    const reviews = await page.evaluate(async () => {
      function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      const allReviews = [];
      const reviewsContainer = document.querySelector('div[role="main"]');
      let lastReviewCount = 0;
      let noNewReviews = 0;

      while (noNewReviews < 3) {
        // Scroll the reviews container
        reviewsContainer.scrollTo(0, reviewsContainer.scrollHeight);
        await sleep(1500);

        // Get all review divs
        const reviewElements = document.querySelectorAll(".jftiEf");

        if (reviewElements.length > lastReviewCount) {
          // Process only new reviews
          for (let i = lastReviewCount; i < reviewElements.length; i++) {
            const review = reviewElements[i];

            // Click "More" button if it exists
            const moreButton = review.querySelector(".w8nwRe.kyuRq");
            if (moreButton) {
              moreButton.click();
              await sleep(100);
            }

            const reviewData = {
              author: review.querySelector(".d4r55")?.textContent?.trim(),
              rating:
                review
                  .querySelector(".kvMYJc")
                  ?.getAttribute("aria-label")
                  ?.split(" ")[0] || null,
              text: review.querySelector(".wiI7pd")?.textContent?.trim(),
              date: review.querySelector(".rsqaWe")?.textContent?.trim(),
            };

            allReviews.push(reviewData);
          }

          console.log(`Processed ${reviewElements.length} reviews...`);
          lastReviewCount = reviewElements.length;
          noNewReviews = 0;
        } else {
          noNewReviews++;
        }

        await sleep(1000);
      }

      return allReviews;
    });

    console.log(`Total reviews collected: ${reviews.length}`);

    // Filter out any reviews with missing data
    const validReviews = reviews.filter(
      (review) => review.author && review.text && review.rating
    );

    const result = {
      total_reviews: validReviews.length,
      collection_date: new Date().toISOString(),
      reviews: validReviews.map((review) => ({
        ...review,
        rating: parseInt(review.rating, 10), // Convert rating to number
      })),
    };

    await fs.writeFile("google_reviews.json", JSON.stringify(result, null, 2));
    console.log("Reviews saved to google_reviews.json");

    return validReviews;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

// URL of the Google Maps reviews page
const placeUrl =
  "https://www.google.com/maps/place/Allo+Beirut+-+City+Walk/@25.2079571,55.2610319,17z/data=!4m8!3m7!1s0x3e5f43bcf6495ef1:0xf0e53853983acfbe!8m2!3d25.2079571!4d55.2636068!9m1!1b1!16s%2Fg%2F11fnh6nz8k?entry=ttu&g_ep=EgoyMDI0MTIxMS4wIKXMDSoASAFQAw%3D%3D";

scrapeGoogleReviews(placeUrl)
  .then((reviews) => {
    console.log("Scraping completed successfully!");
  })
  .catch((error) => {
    console.error("Scraping failed:", error);
    process.exit(1);
  });

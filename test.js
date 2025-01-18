const express = require("express");
const axios = require("axios");
const https = require("https");

const app = express();
const PORT = 3000;

app.use(express.json());

const transformMenuData = (response) => {
  const menus = response.page_data.order.menuList.menus;

  return menus.map((menu) => ({
    section: menu.menu.name,
    items: menu.menu.categories.flatMap((category) =>
      category.category.items.map((itemObj) => {
        const item = itemObj.item;
        return {
          name: item.name,
          description: item.desc,
          price: item.display_price || item.default_price || item.price,
          type: item["tag-slugs"]?.[0] || "unknown",
          imageUrl: item.item_image_url,
          serves: item.info_tags?.[0]?.title?.text || "Not specified",
          preparing_time: item.info_tags?.[1]?.title?.text || "Not specified",
          status: item.item_state,
        };
      })
    ),
  }));
};

const fetchWithRetry = async (url, options, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, options);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Retrying... (${i + 1})`);
    }
  }
};

app.post("/menu", async (req, res) => {
  try {
    const { subDomain } = req.body;

    if (!subDomain) {
      return res.status(400).json({
        success: false,
        message: "URL is required in the request body.",
      });
    }

    const agent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false,
    });

    const apiResponse = await fetchWithRetry(
      `https://www.zomato.com/webroutes/getPage?page_url=/${subDomain}/order&location=&isMobile=0`,
      {
        httpsAgent: agent,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
        },
      }
    );

    const structuredData = transformMenuData(apiResponse.data);

    res.json({
      success: true,
      data: structuredData,
    });
  } catch (error) {
    console.error("Error fetching menu data:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch menu data.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

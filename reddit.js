const puppeteer = require("puppeteer");
const fs = require("fs").promises;

class RedditScraper {
  constructor(topic, maxPosts = 100) {
    this.topic = topic;
    this.maxPosts = maxPosts;
    this.baseUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(
      topic
    )}&sort=top`;
    this.data = {
      topic: topic,
      timestamp: new Date().toISOString(),
      total_posts: 0,
      posts: [],
    };
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920x1080",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
    );
  }

  async scrapeReddit() {
    try {
      console.log(`Starting scrape for topic: ${this.topic}`);
      await this.initialize();

      // Go to Reddit and wait for content
      console.log("Navigating to Reddit...");
      await this.page.goto(this.baseUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Wait for posts to load
      console.log("Waiting for posts to load...");
      await this.page.waitForSelector('div[data-testid="posts-list"]', {
        timeout: 60000,
      });

      // Accept cookies if the banner appears
      try {
        const cookieButton = await this.page.$('button[type="submit"]');
        if (cookieButton) {
          await cookieButton.click();
        }
      } catch (e) {
        console.log("No cookie banner found");
      }

      let lastPostCount = 0;
      let noNewPosts = 0;

      while (this.data.posts.length < this.maxPosts && noNewPosts < 3) {
        // Scroll and collect posts
        const newPosts = await this.collectPosts();

        if (newPosts.length === lastPostCount) {
          noNewPosts++;
          await this.autoScroll();
          await this.page.waitForTimeout(2000);
        } else {
          lastPostCount = newPosts.length;
          noNewPosts = 0;
          this.data.posts = newPosts;
          console.log(`Collected ${newPosts.length} posts...`);
        }
      }

      // Process each post to get comments
      for (let i = 0; i < this.data.posts.length; i++) {
        const post = this.data.posts[i];
        if (post.postUrl) {
          console.log(
            `Scraping comments for post ${i + 1}/${this.data.posts.length}`
          );
          const comments = await this.scrapeComments(post.postUrl);
          this.data.posts[i].comments = comments;
          await this.page.waitForTimeout(1000);
        }
      }

      this.data.total_posts = this.data.posts.length;

      const filename = `reddit_${this.topic.replace(
        /\s+/g,
        "_"
      )}_${Date.now()}.json`;
      await fs.writeFile(filename, JSON.stringify(this.data, null, 2));
      console.log(`Data saved to ${filename}`);

      return this.data;
    } catch (error) {
      console.error("Scraping error:", error);
      throw error;
    } finally {
      await this.browser.close();
    }
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  async collectPosts() {
    return await this.page.evaluate(() => {
      const posts = document.querySelectorAll("shreddit-post");
      return Array.from(posts).map((post) => {
        const titleElement = post.shadowRoot?.querySelector("h3");
        const contentElement = post.shadowRoot?.querySelector(
          'div[slot="text-body"]'
        );
        const scoreElement = post.shadowRoot?.querySelector(
          "faceplate-number[score]"
        );
        const authorElement =
          post.shadowRoot?.querySelector('a[slot="author"]');
        const timestampElement =
          post.shadowRoot?.querySelector("faceplate-timeago");

        return {
          title: titleElement?.textContent?.trim() || "",
          content: contentElement?.textContent?.trim() || "",
          score: scoreElement?.getAttribute("score") || "0",
          author: authorElement?.textContent?.trim() || "",
          timestamp: timestampElement?.getAttribute("ts") || "",
          postUrl: post.getAttribute("permalink") || "",
        };
      });
    });
  }

  async scrapeComments(postUrl) {
    try {
      const commentPage = await this.browser.newPage();
      await commentPage.goto(`https://www.reddit.com${postUrl}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      const comments = await commentPage.evaluate(() => {
        const commentElements = document.querySelectorAll("shreddit-comment");
        return Array.from(commentElements)
          .slice(0, 20)
          .map((comment) => {
            const author =
              comment.shadowRoot
                ?.querySelector('a[slot="author"]')
                ?.textContent?.trim() || "";
            const content =
              comment.shadowRoot
                ?.querySelector('[slot="comment-body"]')
                ?.textContent?.trim() || "";
            const score =
              comment.shadowRoot
                ?.querySelector("faceplate-number[score]")
                ?.getAttribute("score") || "0";

            return { author, content, score };
          });
      });

      await commentPage.close();
      return comments;
    } catch (error) {
      console.warn(
        `Failed to get comments for post: ${postUrl}`,
        error.message
      );
      return [];
    }
  }
}

// Usage example
async function scrapeRedditTopic(topic, maxPosts = 100) {
  const scraper = new RedditScraper(topic, maxPosts);
  try {
    const data = await scraper.scrapeReddit();
    console.log(
      `Successfully scraped ${data.total_posts} posts about "${topic}"`
    );
    return data;
  } catch (error) {
    console.error("Scraping failed:", error);
    throw error;
  }
}

// Example usage
const topic = "artificial intelligence";
scrapeRedditTopic(topic, 50)
  .then(() => console.log("Scraping completed"))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

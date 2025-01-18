import praw
import pandas as pd

# Reddit API credentials
CLIENT_ID = 'Z5DWDToSDlBEnCD1WRsI0YA'  # Ensure this matches your app's client_id
CLIENT_SECRET = 'KgtR3Zc1h8lWrMjvK2UzDtoHO-XKcw'  # Ensure this is correct
USER_AGENT = 'script:test:1.0 (by u/StraightExcuse3612)'

# Initialize Reddit API
reddit = praw.Reddit(
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    user_agent=USER_AGENT
)

# Test Reddit Authentication
try:
    reddit.user.me()
    print("✅ Authentication successful!")
except Exception as e:
    print(f"❌ Authentication failed: {e}")
    exit()

# Function to scrape posts from a subreddit
def scrape_reddit_topic(subreddit_name, sort_by='hot', limit=10):
    subreddit = reddit.subreddit(subreddit_name)
    posts = []
    
    # Choose sorting method
    if sort_by == 'hot':
        submissions = subreddit.hot(limit=limit)
    elif sort_by == 'new':
        submissions = subreddit.new(limit=limit)
    elif sort_by == 'top':
        submissions = subreddit.top(limit=limit)
    else:
        raise ValueError("Invalid sort_by value. Use 'hot', 'new', or 'top'.")

    # Collect post data
    for post in submissions:
        posts.append({
            'Title': post.title,
            'Score': post.score,
            'URL': post.url,
            'Comments': post.num_comments,
            'Author': post.author.name if post.author else 'N/A',
            'Created_UTC': post.created_utc
        })

    # Save to CSV
    df = pd.DataFrame(posts)
    file_name = f'{subreddit_name}_{sort_by}_posts.csv'
    df.to_csv(file_name, index=False)
    print(f"✅ Saved {len(posts)} posts to {file_name}")

# Example usage
if __name__ == '__main__':
    scrape_reddit_topic(subreddit_name='python', sort_by='hot', limit=20)

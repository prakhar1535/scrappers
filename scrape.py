from firecrawl import FirecrawlApp

app = FirecrawlApp(api_key='fc-7b8cdb0a78b3462b85dc3e6a6094d1c8')

response = app.scrape_url(url='https://www.zomato.com/dubai/allo-beirut-al-safa/order', params={
	'formats': [ 'markdown' ],
})
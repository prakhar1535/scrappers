import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
import uuid
from db.db import supabase
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import deque
import time
def normalize_url(url):
    """Normalize the URL by removing the trailing slash if present."""
    parsed = urlparse(url)
    path = parsed.path
    if path.endswith('/'):
        path = path[:-1]
    return urlunparse((parsed.scheme, parsed.netloc, path, parsed.params, parsed.query, parsed.fragment))
def deep_scrape(start_url, max_pages=100, max_depth=5):
    base_url = urlparse(start_url).scheme + "://" + urlparse(start_url).netloc
    visited_urls = set()
    to_visit = deque([(normalize_url(start_url), 0)])  # (url, depth)
    all_content = []
    
    while to_visit and len(visited_urls) < max_pages:
        url, depth = to_visit.popleft()
        
        if url in visited_urls or depth > max_depth:
            continue
        
        visited_urls.add(url)
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            content = extract_content(soup)
            page_links = extract_links(soup, base_url)
            
            all_content.append({
                'id': str(uuid.uuid4()),
                'url': url,
                'title': soup.title.string if soup.title else '',
                'content': content,
                'content_length': len(content),
                'links': page_links
            })
            
            for link in page_links:
                normalized_link = normalize_url(link)
                if normalized_link not in visited_urls:
                    to_visit.append((normalized_link, depth + 1))
            
            time.sleep(1)  # Polite delay between requests
        
        except Exception as e:
            print(f"Error scraping {url}: {str(e)}")
    
    return all_content

def extract_content(soup):
    for element in soup(["script", "style", "meta", "link"]):
        element.decompose()

    content = []
    for tag in soup.find_all(True):
        if tag.name in ['br', 'hr']:
            continue
        text = tag.get_text(strip=True)
        if text:
            if tag.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                heading_level = int(tag.name[1])
                content.append(f"{'#' * heading_level} {text}")
            elif tag.name == 'p':
                content.append(f"\n{text}\n")
            elif tag.name == 'a':
                href = tag.get('href')
                if href:
                    content.append(f"[{text}]({href})")
                else:
                    content.append(text)
            elif tag.name in ['ul', 'ol']:
                for li in tag.find_all('li', recursive=False):
                    content.append(f"- {li.get_text(strip=True)}")
            else:
                content.append(text)

    return '\n'.join(content)

def extract_links(soup, base_url):
    links = set()
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        full_url = urljoin(base_url, href)
        normalized_url = normalize_url(full_url)
        if is_valid_link(normalized_url, base_url):
            links.add(normalized_url)
    return list(links)

def is_valid_link(url, base_url):
    parsed_url = urlparse(url)
    parsed_base = urlparse(base_url)
    return (parsed_url.netloc == parsed_base.netloc or not parsed_url.netloc) and parsed_url.scheme in ('http', 'https')

def scrape_and_add_link(data):
    chatbot_id = data.get('chatbotId')
    url = normalize_url(data.get('url', ''))
    
    if not chatbot_id or not url:
        return {'message': 'Chatbot ID and URL are required', 'status': 400}

    try:
        # Check if a record already exists for this chatbot_id
        existing_record = supabase.table('chatbot_scraped_content').select('id').eq('chatbot_id', chatbot_id).execute()

        scraped_data = deep_scrape(url, max_pages=50, max_depth=3)
        
        if not scraped_data:
            return {'message': f'Failed to scrape {url}', 'status': 500}
        
        total_content_length = sum(page['content_length'] for page in scraped_data)
        
        insert_data = {
            'chatbot_id': chatbot_id,
            'url': url,
            'title': scraped_data[0]['title'],
            'content': scraped_data[0]['content'],
            'content_length': total_content_length,
            'links': json.dumps([{
                'id': page['id'],
                'url': normalize_url(page['url']),
                'title': page['title'],
                'content': page['content'],
                'content_length': page['content_length']
            } for page in scraped_data])  # Include all pages, including the main one
        }
        
        if existing_record.data:
            # Update existing record
            existing_id = existing_record.data[0]['id']
            update_response = supabase.table('chatbot_scraped_content').update(insert_data).eq('id', existing_id).execute()
            if update_response.data:
                return {
                    'message': 'Content updated successfully',
                    'status': 200,
                    'id': existing_id,
                    'chatbot_id': chatbot_id,
                    'url': url,
                    'title': scraped_data[0]['title'],
                    'content_length': total_content_length,
                    'links_count': len(scraped_data),
                    'links': [{
                        'id': page['id'],
                        'url': normalize_url(page['url']),
                        'title': page['title'],
                        'content_length': page['content_length']
                    } for page in scraped_data]
                }
            else:
                return {'message': 'Failed to update scraped content', 'status': 500, 'error': update_response.error.message}
        else:
            # Insert new record
            insert_data['id'] = str(uuid.uuid4())
            insert_response = supabase.table('chatbot_scraped_content').insert(insert_data).execute()
            if insert_response.data:
                return {
                    'message': 'Content scraped and saved successfully',
                    'status': 200,
                    'id': insert_data['id'],
                    'chatbot_id': chatbot_id,
                    'url': url,
                    'title': scraped_data[0]['title'],
                    'content_length': total_content_length,
                    'links_count': len(scraped_data),
                    'links': [{
                        'id': page['id'],
                        'url': normalize_url(page['url']),
                        'title': page['title'],
                        'content_length': page['content_length']
                    } for page in scraped_data]
                }
            else:
                return {'message': 'Failed to save scraped content', 'status': 500, 'error': insert_response.error.message}

    except Exception as e:
        return {'message': f'Error scraping {url}', 'status': 500, 'error': str(e)}

def get_chatbot_links(chatbot_id):
    try:
        print(f"Attempting to retrieve links for chatbot ID: {chatbot_id}")

        response = supabase.table('chatbot_scraped_content').select('*').eq('chatbot_id', chatbot_id).execute()
        print(f"Query result: {response}")

        if not response.data:
            return {
                'message': f'No scraped content found for chatbot ID: {chatbot_id}',
                'status': 404
            }

        processed_data = []
        for item in response.data:
            links = json.loads(item.get('links', '[]'))
            
            processed_item = {
                'id': item.get('id'),
                'url': item.get('url', ''),
                'title': item.get('title', ''),
                'content_length': item.get('content_length', 0),
                'links_count': len(links),
                'links': [{
                    'id': link.get('id'),
                    'url': link.get('url', ''),
                    'title': link.get('title', ''),
                    'content_length': link.get('content_length', 0)
                } for link in links]
            }

            processed_data.append(processed_item)

        return {
            'message': 'Data retrieved successfully',
            'status': 200,
            'data': processed_data
        }

    except Exception as e:
        print(f"Error in get_chatbot_links: {str(e)}")
        return {
            'message': f'Error retrieving data: {str(e)}',
            'status': 500
        }
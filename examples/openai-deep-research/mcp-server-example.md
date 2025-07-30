# Building a Deep Research Compatible MCP Server

Deep research models require MCP servers that implement a specific search and fetch interface. This guide shows you how to build a compatible server.

## Required Interface

Your MCP server must provide exactly two tools:

1. **search** - Searches your data and returns results
2. **fetch** - Retrieves full content for a specific document

## Example Implementation

Here's a minimal Express.js server that implements the required interface:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// Sample data store
const documents = {
  doc1: {
    id: 'doc1',
    title: 'Q1 Sales Report',
    content: 'Total sales for Q1 were $1.2M, up 15% from last year...',
    metadata: { department: 'sales', date: '2025-03-31' },
  },
  doc2: {
    id: 'doc2',
    title: 'Product Roadmap 2025',
    content: 'Key features planned: AI integration, mobile app redesign...',
    metadata: { department: 'product', date: '2025-01-15' },
  },
};

// MCP endpoint
app.post('/mcp', async (req, res) => {
  const { method, params } = req.body;

  // List available tools
  if (method === 'tools/list') {
    return res.json({
      tools: [
        {
          name: 'search',
          description: 'Search internal documents',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results', default: 10 },
            },
            required: ['query'],
          },
        },
        {
          name: 'fetch',
          description: 'Fetch document by ID',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Document ID' },
            },
            required: ['id'],
          },
        },
      ],
    });
  }

  // Handle tool calls
  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    if (name === 'search') {
      // Simple search implementation
      const query = args.query.toLowerCase();
      const results = Object.values(documents)
        .filter(
          (doc) =>
            doc.title.toLowerCase().includes(query) || doc.content.toLowerCase().includes(query),
        )
        .slice(0, args.limit || 10)
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          snippet: doc.content.substring(0, 100) + '...',
          metadata: doc.metadata,
        }));

      return res.json({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results }, null, 2),
          },
        ],
      });
    }

    if (name === 'fetch') {
      const doc = documents[args.id];
      if (!doc) {
        return res.json({
          content: [
            {
              type: 'text',
              text: 'Document not found',
            },
          ],
          isError: true,
        });
      }

      return res.json({
        content: [
          {
            type: 'text',
            text: JSON.stringify(doc, null, 2),
          },
        ],
      });
    }

    return res.status(400).json({ error: 'Unknown tool' });
  }

  return res.status(400).json({ error: 'Unknown method' });
});

app.listen(3000, () => {
  console.log('MCP server running on http://localhost:3000');
});
```

## Python Example with FastAPI

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import json

app = FastAPI()

# Sample data store
documents = {
    "doc1": {
        "id": "doc1",
        "title": "Q1 Sales Report",
        "content": "Total sales for Q1 were $1.2M, up 15% from last year...",
        "metadata": {"department": "sales", "date": "2025-03-31"}
    },
    "doc2": {
        "id": "doc2",
        "title": "Product Roadmap 2025",
        "content": "Key features planned: AI integration, mobile app redesign...",
        "metadata": {"department": "product", "date": "2025-01-15"}
    }
}

class MCPRequest(BaseModel):
    method: str
    params: Optional[Dict[str, Any]] = None

@app.post("/mcp")
async def mcp_endpoint(request: MCPRequest):
    if request.method == "tools/list":
        return {
            "tools": [
                {
                    "name": "search",
                    "description": "Search internal documents",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"},
                            "limit": {"type": "number", "description": "Max results", "default": 10}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "fetch",
                    "description": "Fetch document by ID",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "description": "Document ID"}
                        },
                        "required": ["id"]
                    }
                }
            ]
        }

    elif request.method == "tools/call":
        tool_name = request.params.get("name")
        args = request.params.get("arguments", {})

        if tool_name == "search":
            query = args.get("query", "").lower()
            limit = args.get("limit", 10)

            results = []
            for doc in documents.values():
                if query in doc["title"].lower() or query in doc["content"].lower():
                    results.append({
                        "id": doc["id"],
                        "title": doc["title"],
                        "snippet": doc["content"][:100] + "...",
                        "metadata": doc["metadata"]
                    })

            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps({"results": results[:limit]}, indent=2)
                    }
                ]
            }

        elif tool_name == "fetch":
            doc_id = args.get("id")
            doc = documents.get(doc_id)

            if not doc:
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": "Document not found"
                        }
                    ],
                    "isError": True
                }

            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(doc, indent=2)
                    }
                ]
            }

        raise HTTPException(status_code=400, detail="Unknown tool")

    raise HTTPException(status_code=400, detail="Unknown method")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

## Integration with Deep Research

Configure your deep research model to use your MCP server:

```yaml
providers:
  - id: openai:responses:o3-deep-research
    config:
      max_output_tokens: 100000
      tools:
        - type: web_search_preview # Required
        - type: mcp
          server_label: internal_docs
          server_url: http://localhost:3000/mcp
          require_approval: never # Required for deep research
          headers:
            Authorization: Bearer your-api-key
```

## Best Practices

1. **Efficient Search**: Implement proper indexing (e.g., Elasticsearch, PostgreSQL full-text search)
2. **Result Ranking**: Return most relevant results first
3. **Metadata**: Include useful metadata in search results
4. **Error Handling**: Return clear error messages for debugging
5. **Authentication**: Secure your MCP server with API keys or OAuth
6. **Rate Limiting**: Implement rate limits to prevent abuse
7. **Logging**: Log all requests for debugging and monitoring

## Testing Your MCP Server

Test your server using curl:

```bash
# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'

# Search
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {"query": "sales"}
    }
  }'

# Fetch
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "fetch",
      "arguments": {"id": "doc1"}
    }
  }'
```

## Advanced Features

### Connecting to Real Data Sources

Replace the sample data with connections to your actual systems:

```javascript
// Example: Connect to PostgreSQL
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// In your search handler
if (name === 'search') {
  const result = await pool.query(
    'SELECT id, title, content FROM documents WHERE to_tsvector(content) @@ plainto_tsquery($1) LIMIT $2',
    [args.query, args.limit || 10],
  );
  // Format and return results...
}
```

### Adding Filters

Enhance search with filters:

```javascript
{
  name: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      filters: {
        type: 'object',
        properties: {
          department: { type: 'string' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' }
        }
      }
    }
  }
}
```

Remember: Deep research models will automatically use your search and fetch tools to gather information needed to answer user queries. The better your search implementation, the better the research results will be.

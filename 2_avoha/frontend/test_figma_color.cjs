const fs = require('fs');
const https = require('https');

const config = JSON.parse(fs.readFileSync('/Users/chan/.gemini/antigravity/mcp_config.json', 'utf8'));
const token = config.mcpServers.figma.env.FIGMA_API_KEY;

const options = {
  hostname: 'api.figma.com',
  path: '/v1/files/VFps0ZMmOBYo81hbGMJCo2/nodes?ids=12:299',
  method: 'GET',
  headers: {
    'X-Figma-Token': token
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const node = json.nodes['12:299'].document;
    const bookModal = node.children.find(c => c.name === '도감' && c.type === 'GROUP');
    
    bookModal.children.slice(0, 3).forEach(child => {
       console.log(`${child.name} fills:`, JSON.stringify(child.fills));
    });
  });
});
req.end();

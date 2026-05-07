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
    
    // The book modal is likely the last child of "메인화면_도감"
    const bookModal = node.children.find(c => c.name === '도감' && c.type === 'GROUP');
    if (!bookModal) return console.log('도감 modal group not found');
    
    console.log(`도감 Group - Y: ${bookModal.absoluteBoundingBox.y}, X: ${bookModal.absoluteBoundingBox.x}, W: ${bookModal.absoluteBoundingBox.width}, H: ${bookModal.absoluteBoundingBox.height}`);
    
    bookModal.children.forEach(child => {
       console.log(`${child.name} (${child.type}) - Y: ${child.absoluteBoundingBox.y}, X: ${child.absoluteBoundingBox.x}, W: ${child.absoluteBoundingBox.width}, H: ${child.absoluteBoundingBox.height}`);
    });
  });
});
req.end();

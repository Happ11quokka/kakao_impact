const fs = require('fs');
const https = require('https');

const config = JSON.parse(fs.readFileSync('/Users/chan/.gemini/antigravity/mcp_config.json', 'utf8'));
const token = config.mcpServers.figma.env.FIGMA_API_KEY;

const options = {
  hostname: 'api.figma.com',
  path: '/v1/files/VFps0ZMmOBYo81hbGMJCo2/nodes?ids=12:253',
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
    const node = json.nodes['12:253'].document;
    
    // Find 메인화면
    const mainScreen = node.children.find(c => c.name === '메인화면');
    if (!mainScreen) return console.log('메인화면 not found');
    
    mainScreen.children.forEach(child => {
       console.log(`${child.name} - Y: ${child.absoluteBoundingBox.y}, X: ${child.absoluteBoundingBox.x}, W: ${child.absoluteBoundingBox.width}, H: ${child.absoluteBoundingBox.height}`);
    });
  });
});

req.on('error', error => console.error(error));
req.end();

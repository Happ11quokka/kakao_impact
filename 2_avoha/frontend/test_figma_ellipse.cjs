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
    const mainScreen = json.nodes['12:253'].document.children.find(c => c.name === '메인화면');
    const ellipse21 = mainScreen.children.find(c => c.name === 'Ellipse 21');
    const rect196 = mainScreen.children.find(c => c.name === 'Rectangle 196');
    const dateText = mainScreen.children.find(c => c.name === '5월 5일 화요일');
    
    console.log('Ellipse 21 fills:', JSON.stringify(ellipse21.fills));
    console.log('Rectangle 196 fills:', JSON.stringify(rect196.fills));
    console.log('Date Text fills:', JSON.stringify(dateText.fills));
  });
});
req.end();

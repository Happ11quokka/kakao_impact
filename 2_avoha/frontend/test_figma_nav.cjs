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
    
    // Find nav texts
    const homeText = mainScreen.children.find(c => c.name === '홈');
    const analysisText = mainScreen.children.find(c => c.name === '감정분석');
    
    // Find nav buttons
    const navButtons = mainScreen.children.filter(c => c.name === '홈버튼' && c.type === 'ELLIPSE');
    
    console.log('Home text fills:', JSON.stringify(homeText.fills));
    console.log('Analysis text fills:', JSON.stringify(analysisText.fills));
    console.log('Active Nav Button fills:', JSON.stringify(navButtons[0].fills));
    console.log('Active Nav Button strokes:', JSON.stringify(navButtons[0].strokes));
    console.log('Inactive Nav Button fills:', JSON.stringify(navButtons[1].fills));
    console.log('Inactive Nav Button strokes:', JSON.stringify(navButtons[1].strokes));
    
    // Print all nav button locations
    navButtons.forEach((b, i) => {
      console.log(`Nav button ${i} - Y: ${b.absoluteBoundingBox.y}, X: ${b.absoluteBoundingBox.x}, W: ${b.absoluteBoundingBox.width}, H: ${b.absoluteBoundingBox.height}`);
    });
  });
});
req.end();

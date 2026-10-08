const { execFileSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['session-store', 'model', 'epidemic', 'city-ui', 'mayor', 'city-depth', 'city-campaign', 'mayor-ui', 'contest', 'contest-ui', 'score']) {
  execFileSync(process.execPath, [path.join(__dirname, file + '.cjs')], { stdio: 'inherit' });
}

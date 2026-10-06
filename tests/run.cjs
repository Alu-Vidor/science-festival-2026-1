const { execFileSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['model', 'epidemic', 'city-ui', 'mayor', 'city-depth', 'mayor-ui', 'contest', 'contest-ui']) {
  execFileSync(process.execPath, [path.join(__dirname, file + '.cjs')], { stdio: 'inherit' });
}

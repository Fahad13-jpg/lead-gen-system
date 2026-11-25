'use strict';
// A build must bundle executable auth helpers, not publish them as .cjs assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('dashboard/build');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'asset-manifest.json'),'utf8'));
assert.ok(!Object.values(manifest.files).some(file=>/\/static\/media\/.*\.cjs(?:$|\?)/.test(file)), 'CommonJS source was emitted as an asset');
const main=fs.readFileSync(path.join(root,manifest.files['main.js'].replace(/^\//,'')),'utf8');
assert.ok(!/static\/media\/session\.[a-f0-9]+\.cjs/.test(main),'Session validator must execute as code');
assert.match(main,/INVALID_MEMBERSHIP/,'Executable membership validator is missing');
assert.match(main,/MEMBERSHIP_REQUIRED/,'Organization selection validator is missing');
console.log(JSON.stringify({passed:true,auth_helper_bundled_as_code:true,cjs_asset_imports:0}));

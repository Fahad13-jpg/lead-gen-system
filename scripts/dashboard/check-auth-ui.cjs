// Isolated build with Firebase configuration absent. No real login or email is attempted.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [], errors = [], output = path.resolve('.local/dashboard-preview');
  fs.mkdirSync(output, { recursive: true });
  page.on('request', req => requests.push(req.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('lg_user', JSON.stringify({id:1,email:'forged@example.test'})));
  try {
    await page.goto('http://127.0.0.1:3001/dashboard');
    await page.getByRole('heading', {name:'Welcome back'}).waitFor();
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal(await page.evaluate(() => localStorage.getItem('lg_user')), null);
    assert.equal(await page.getByRole('button', {name:'Continue with Google'}).isDisabled(), true);
    await page.getByLabel('Email address').fill('fixture@example.test');
    await page.getByLabel('Password', {exact:true}).fill('fixture-password');
    assert.equal(await page.getByRole('button', {name:'Sign in',exact:true}).isDisabled(), true);
    await page.screenshot({path:path.join(output,'login-desktop.png'),fullPage:true});
    await page.getByRole('button', {name:'Forgot password?'}).click();
    await page.getByRole('heading',{name:'Reset your password'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Send reset instructions'}).isDisabled(),true);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Create an account'}).click();
    await page.getByRole('heading',{name:'Create your account'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).isDisabled(),true);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,'signup-mobile.png'),fullPage:true});
    await page.goto('http://127.0.0.1:3001/access');
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(url=>!(/\/dashboard-api\/|\/webhook\/|identitytoolkit|securetoken/.test(url))), 'Unconfigured login must not call auth or backend services');
    console.log(JSON.stringify({passed:true,checks:['forged legacy session rejected','private route redirects','Google/password/signup/reset disabled without config','legacy storage removed','access route protected','mobile no overflow','no JavaScript errors','no auth/backend/provider calls'],live_login_verified:false,screenshots:output},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

// Configured SDK boot only. Does not click sign-in, register/reset or create accounts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const origin=process.env.DASHBOARD_PREVIEW_ORIGIN||'http://127.0.0.1:3001';
  if(!/^http:\/\/127\.0\.0\.1:300[12]$/.test(origin))throw Error('LOCAL_PREVIEW_REQUIRED');
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],errors=[];
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('lg_user',JSON.stringify({id:1,email:'forged@example.test'})));
  try{
    await page.goto(origin+'/dashboard');
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
    await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Continue with Google'));return b&&!b.disabled;});
    assert.equal(new URL(page.url()).pathname,'/login');
    assert.equal(await page.getByText('Sign-in setup is in progress.',{exact:false}).count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('lg_user')),null);
    assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).isEnabled(),true);
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,3000))]));
    await page.screenshot({path:path.resolve('.local/dashboard-preview/firebase-login-configured.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    assert.equal(requests.filter(r=>r.method==='POST').length,0,'Boot must not create accounts, sign in or send email');
    assert.equal(requests.filter(r=>/\/dashboard-api\/|\/webhook\//.test(r.url)).length,0,'No organization request before identity');
    console.log(JSON.stringify({passed:true,firebase_boot:'ready',legacy_session_rejected:true,sign_in_controls_enabled:true,sign_in_attempted:false,accounts_created:0,emails_sent:0,backend_requests:0,live_authentication_verified:false},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

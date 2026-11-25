'use strict';
// Pinned issuer/audience/key configuration from the server, never token-supplied URLs.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
function verify(token,config,now=Math.floor(Date.now()/1000)){
 try{
  assert(typeof token==='string'&&token.length<=16384);
  const parts=token.split('.');assert(parts.length===3&&parts.every(s=>/^[A-Za-z0-9_-]+$/.test(s)));
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert(header.alg==='RS256'&&typeof header.kid==='string'&&!header.crit&&!header.jku&&!header.x5u&&!header.jwk);
  const key=config.keys instanceof Map?config.keys.get(header.kid):null;assert(key);
  const publicKey=crypto.createPublicKey(key);assert(publicKey.asymmetricKeyType==='rsa'&&publicKey.asymmetricKeyDetails.modulusLength>=2048);
  assert(crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')));
  assert(typeof config.issuer==='string'&&config.issuer&&typeof config.audience==='string'&&config.audience);
  assert(claims.iss===config.issuer&&(claims.aud===config.audience||Array.isArray(claims.aud)&&claims.aud.includes(config.audience)));
  assert(typeof claims.sub==='string'&&claims.sub.length>0&&claims.sub.length<=512&&!claims.sub.includes('\0'));
  assert(Number.isInteger(claims.exp)&&claims.exp>now&&Number.isInteger(claims.iat)&&claims.iat<=now&&claims.exp>claims.iat&&claims.exp-claims.iat<=3600);
  assert(claims.nbf===undefined||Number.isInteger(claims.nbf)&&claims.nbf<=now);
  return {subject:crypto.createHash('sha256').update(claims.iss+'\0'+claims.sub).digest('hex')};
 }catch{throw Error('AUTHENTICATION_FAILED');}
}
module.exports={verify};

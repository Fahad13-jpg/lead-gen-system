import React from'react';
// Logo and button treatment follow Google's HTML branding example (Apache 2.0).
// https://developers.google.com/identity/branding-guidelines
export default function GoogleButton({disabled,onClick}){return <button className="ws-google" type="button" disabled={disabled} onClick={onClick}><span className="ws-google-icon" aria-hidden="true"><img src="/brand/google-g.svg" width="20" height="20" alt=""/></span><span>Continue with Google</span></button>;}

import React from'react';
import{brand}from'../brand';
export default function Brand(){return <span className="lm-brand"><span className="lm-brand-mark" aria-hidden="true" style={{maskImage:`url(${brand.logo})`,WebkitMaskImage:`url(${brand.logo})`}}/><span>{brand.name}</span></span>;}

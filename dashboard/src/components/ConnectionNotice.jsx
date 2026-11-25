import React from'react';
import{CheckCircle,Info}from'lucide-react';
export default function ConnectionNotice({title,children,tone='neutral'}){
 const Icon=tone==='success'?CheckCircle:Info;
 return <div className="st-connection-notice" data-tone={tone} role="status"><Icon size={18} aria-hidden="true"/><div><h3>{title}</h3><p>{children}</p></div></div>;
}

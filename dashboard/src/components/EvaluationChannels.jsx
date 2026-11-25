import React from 'react';
import HelpTip from './HelpTip';
import release from '../release.json';
export const evaluationMode=release.evaluationMode;
export const deferredFeature=feature=>evaluationMode&&release.deferredFeatures.includes(feature);
export default function EvaluationChannels(){
 if(!evaluationMode)return null;
 return <section className="pk-summary"><h2>Ready for your outreach</h2><p>Email, manual WhatsApp, LinkedIn and Messenger are available in this version.</p><p>Calling, SMS and automated WhatsApp <HelpTip label="Coming in Version 2">These options are planned for Version 2.</HelpTip><span className="pk-tag">Version 2</span></p></section>;
}

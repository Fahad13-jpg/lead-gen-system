import React from 'react';
import {Link} from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
const questions=[
 ['What does the system help me do?','Find businesses, review their contact details and research, prepare messages around your offer, and manage approved outreach from one workspace.'],
 ['Which channels are included in Free?','Email, manual LinkedIn, manual WhatsApp and manual Messenger. Manual channels prepare a message for you to review and send in the destination service.'],
 ['What is planned for Version 2?','Calling, SMS and automated WhatsApp are planned for Version 2. The evaluation version focuses on email and manual WhatsApp, LinkedIn and Messenger.'],
 ['Can I connect my own accounts?','For this version, connect Apify and Gmail or another email provider. Manual WhatsApp, LinkedIn and Messenger do not need a provider connection. Each provider’s charges, permissions and limits still apply. Account connection does not start outreach.'],
 ['Does the system send messages as soon as I sign up?','No. You need an authorized workspace, a configured channel and the required content and campaign approvals. Scheduling, recipient eligibility, opt-outs and spending checks still apply.'],
 ['Are all the contacts verified?','No. A contact found during research can be missing, outdated or incorrect. Found email addresses and assessment records are not proof of deliverability or permission to contact someone.'],
 ['Do messages go out automatically on LinkedIn or Messenger?','No. These are manual copy-and-open workflows. You review the prepared message, open the destination service and send it yourself.'],
 ['What happens when someone replies or opts out?','Supported automated workflows check recorded replies and stop-contact events before admitting more work. You must also honor requests received through channels you manage manually.'],
 ['Can I pause a campaign?','Available campaign controls stop future admissions. They cannot recall messages already sent or reliably cancel a provider request that is already in progress. Check uncertain outcomes before trying again.'],
 ['Can I buy Plus or managed calling online?','Online checkout and final pricing are not available yet. Package access is currently arranged with the platform operator. Managed calling is a separate planned resource, not an included Plus balance.']
];
export default function Faq(){return <PublicLayout title="Frequently asked questions" intro="A few things to know before you connect your accounts.">{questions.map(([q,a])=><details className="public-faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}<section><h2>Need more detail?</h2><p>Read our <Link to="/privacy">privacy notice</Link> and <Link to="/terms">terms</Link>, or visit <Link to="/contact">Contact and support</Link>.</p></section></PublicLayout>;}

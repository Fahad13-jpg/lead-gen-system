'use strict';
module.exports={
 smtp:{'ManagedSender.node.js':'scripts/sender-connections/n8n/ManagedSender.node.js','lead-system/scripts/sender-connections/worker.cjs':'scripts/sender-connections/worker.cjs','lead-system/scripts/sender-connections/clients.cjs':'scripts/sender-connections/clients.cjs','lead-system/scripts/sender-connections/smtp-check.cjs':'scripts/sender-connections/smtp-check.cjs'},
 campaign:{'ManagedCampaignSender.node.js':'scripts/sender-connections/n8n/ManagedCampaignSender.node.js','campaign-system/scripts/sender-connections/campaign-worker.cjs':'scripts/sender-connections/campaign-worker.cjs','campaign-system/scripts/sender-connections/campaign-smtp-executor.cjs':'scripts/sender-connections/campaign-smtp-executor.cjs','campaign-system/scripts/sender-connections/email-release-policy.cjs':'scripts/sender-connections/email-release-policy.cjs','campaign-system/scripts/sender-connections/campaign-slice.cjs':'scripts/sender-connections/campaign-slice.cjs'}
};

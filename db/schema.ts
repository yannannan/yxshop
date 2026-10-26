import { integer, real, sqliteTable, text, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// MySQL production DDL is maintained in sql/10_site_analysis_20261025.sql and sql/11_site_management_20261026.sql.
export const siteAnalysisIntegrations = sqliteTable('site_analysis_integrations', {
  siteId:text('site_id').primaryKey(),userId:integer('user_id').notNull(),scriptToken:text('script_token').notNull(),verifiedAt:text('verified_at').notNull().default(''),lastSeenAt:text('last_seen_at').notNull().default(''),verifyRequestedAt:text('verify_requested_at').notNull().default(''),deletedAt:text('deleted_at').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
}, table=>[uniqueIndex('uq_site_script').on(table.scriptToken)]);
export const siteAnalysisVisits = sqliteTable('site_analysis_visits', {
  siteId:text('site_id').notNull(),eventId:text('event_id').notNull(),sessionKey:text('session_key').notNull(),channel:text('channel').notNull(),pagePath:text('page_path').notNull(),countryCode:text('country_code').notNull().default(''),createdAt:text('created_at').notNull(),
}, table=>[primaryKey({columns:[table.siteId,table.eventId]}),index('idx_site_visits_period').on(table.siteId,table.createdAt)]);
export const siteAnalysisSites = sqliteTable('site_analysis_sites', {
  id: text('id').primaryKey(), userId: integer('user_id').notNull(), host: text('host').notNull(), url: text('url').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('uq_analysis_site').on(table.userId, table.host)]);
export const siteAnalysisRuns = sqliteTable('site_analysis_runs', {
  id: text('id').primaryKey(), siteId: text('site_id').notNull(), userId: integer('user_id').notNull(), productId: integer('product_id').notNull(), host: text('host').notNull(), sourceUrl: text('source_url').notNull(), requestHash: text('request_hash').notNull(), optionsJson: text('options_json').notNull(), billingMode: text('billing_mode').notNull(), pointsCost: integer('points_cost').notNull().default(0), status: text('status').notNull().default('queued'), progress: integer('progress').notNull().default(0), stage: text('stage').notNull().default(''), attempts: integer('attempts').notNull().default(0), claimToken: text('claim_token').notNull().default(''), leaseUntil: text('lease_until').notNull().default(''), draftJson: text('draft_json').notNull().default(''), errorMessage: text('error_message').notNull().default(''), charged: integer('charged').notNull().default(0), pointsSpent: integer('points_spent').notNull().default(0), billingOrderId: text('billing_order_id').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), completedAt: text('completed_at').notNull().default(''),
}, table => [index('idx_analysis_queue').on(table.status,table.leaseUntil,table.createdAt),index('idx_analysis_run_user').on(table.userId,table.productId,table.createdAt)]);
export const siteAnalysisReports = sqliteTable('site_analysis_reports', { runId: text('run_id').primaryKey(), userId: integer('user_id').notNull(), siteId: text('site_id').notNull(), reportJson: text('report_json').notNull(), createdAt: text('created_at').notNull() });
export const siteAnalysisPages = sqliteTable('site_analysis_pages', { runId: text('run_id').notNull(), urlHash: text('url_hash').notNull(), url: text('url').notNull(), pageJson: text('page_json').notNull() }, table => [primaryKey({columns:[table.runId,table.urlHash]})]);
export const siteAnalysisKeywords = sqliteTable('site_analysis_keywords', { runId: text('run_id').notNull(), wordHash: text('word_hash').notNull(), keyword: text('keyword').notNull(), kind: text('kind').notNull(), score: integer('score').notNull(), sourcesJson: text('sources_json').notNull() }, table => [primaryKey({columns:[table.runId,table.wordHash]})]);
export const siteAnalysisRankings = sqliteTable('site_analysis_rankings', { runId: text('run_id').notNull(), engine: text('engine').notNull(), wordHash: text('word_hash').notNull(), keyword: text('keyword').notNull(), state: text('state').notNull(), position: integer('position'), url: text('url').notNull(), sourceUrl: text('source_url').notNull(), checkedAt: text('checked_at').notNull(), message: text('message').notNull() }, table => [primaryKey({columns:[table.runId,table.engine,table.wordHash]})]);
export const siteAnalysisEvents = sqliteTable('site_analysis_events', { id: integer('id').primaryKey({autoIncrement:true}),runId:text('run_id').notNull(),stage:text('stage').notNull(),state:text('state').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull() });
export const siteAnalysisWorkers = sqliteTable('site_analysis_workers', { id:text('id').primaryKey(),heartbeatAt:text('heartbeat_at').notNull() });
export const siteAnalysisIssueActions = sqliteTable('site_analysis_issue_actions', { runId:text('run_id').notNull(),userId:integer('user_id').notNull(),issueKey:text('issue_key').notNull(),state:text('state').notNull().default('pending'),updatedAt:text('updated_at').notNull() }, table => [primaryKey({columns:[table.runId,table.userId,table.issueKey]})]);

export const videoExtractionPreviews = sqliteTable('video_extraction_previews', {
  id: text('id').primaryKey(), userId: integer('user_id').notNull(), productId: integer('product_id').notNull(), sourceUrl: text('source_url').notNull(), metadataJson: text('metadata_json').notNull(), createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(),
});
export const videoExtractionTasks = sqliteTable('video_extraction_tasks', {
  id: text('id').primaryKey(), userId: integer('user_id').notNull(), productId: integer('product_id').notNull(), requestHash: text('request_hash').notNull(), title: text('title').notNull(), formatLabel: text('format_label').notNull(), formatJson: text('format_json').notNull(), billingMode: text('billing_mode').notNull(), pointsCost: integer('points_cost').notNull().default(0), status: text('status').notNull().default('queued'), progress: integer('progress').notNull().default(0), fileExtension: text('file_extension').notNull(), fileSize: integer('file_size').notNull().default(0), charged: integer('charged').notNull().default(0), pointsSpent: integer('points_spent').notNull().default(0), billingOrderId: text('billing_order_id').notNull().default(''), errorMessage: text('error_message').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), expiresAt: text('expires_at').notNull(),
});

export const toolGenerationResults = sqliteTable('tool_generation_results', {
  id: text('id').primaryKey(), userId: integer('user_id').notNull(), productId: integer('product_id').notNull(), orderId: text('order_id').notNull(), requestHash: text('request_hash').notNull(), imageBase64: text('image_base64').notNull(), imageSize: integer('image_size').notNull(), charged: integer('charged').notNull().default(0), createdAt: text('created_at').notNull(),
});

export const pointsWallets = sqliteTable('points_wallets', { userId: integer('user_id').primaryKey(), balance: integer('balance').notNull().default(100), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull() });
export const pointsLedger = sqliteTable('points_ledger', { operationId: text('operation_id').primaryKey(), userId: integer('user_id').notNull(), kind: text('kind').notNull(), delta: integer('delta').notNull(), balanceAfter: integer('balance_after').notNull(), productId: integer('product_id'), orderId: text('order_id'), createdAt: text('created_at').notNull() });

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone: text('phone').notNull().unique(),
  email: text('email').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const userProfiles = sqliteTable('yxshop_user_profiles', {
  userId: integer('user_id').primaryKey(), nickname: text('nickname').notNull().default(''),
  avatarData: text('avatar_data').notNull(), avatarMime: text('avatar_mime').notNull().default(''), avatarVersion: text('avatar_version').notNull().default(''),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});

export const products = sqliteTable('products', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: real('price').notNull(),
  costPrice: real('cost_price').notNull().default(0),
  oldPrice: real('old_price').notNull(),
  billingCycle: text('billing_cycle').notNull().default('once'),
  attributesJson: text('attributes_json').notNull().default('[]'),
  coverImage: text('cover_image').notNull().default(''),
  detailImage: text('detail_image').notNull().default(''),
  status: text('status').notNull().default('active'),
  stock: integer('stock').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  productType: text('product_type').notNull().default('digital'),
  toolSlug: text('tool_slug').unique(),
  toolUrl: text('tool_url'),
  toolChargeType: text('tool_charge_type').notNull().default('pending'),
  toolPlansJson: text('tool_plans_json'),
  toolPointsCost: integer('tool_points_cost').notNull().default(0),
  pointsAmount: integer('points_amount').notNull().default(0),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  productId: integer('product_id').notNull(),
  credentialId: integer('credential_id'),
  amount: real('amount').notNull(),
  status: text('status').notNull().default('pending'),
  rechargeJson: text('recharge_json').notNull().default(''),
  createdAt: text('created_at').notNull(),
  deliveredAt: text('delivered_at'),
  toolPlanKey: text('tool_plan_key').notNull().default(''),
  toolPlanName: text('tool_plan_name').notNull().default(''),
  toolBillingCycle: text('tool_billing_cycle').notNull().default(''),
  toolPaidAt: text('tool_paid_at'),
  toolUsesRemaining: integer('tool_uses_remaining').notNull().default(0),
  pointsAmount: integer('points_amount').notNull().default(0),
});

export const toolUsageEvents = sqliteTable('tool_usage_events', {
  operationId: text('operation_id').primaryKey(),
  orderId: text('order_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const credentials = sqliteTable('credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull(),
  content: text('content').notNull(),
  account: text('account').notNull().default(''),
  password: text('password').notNull().default(''),
  emailAuthCode: text('email_auth_code').notNull().default(''),
  verificationUrl: text('verification_url').notNull().default(''),
  costPrice: real('cost_price').notNull().default(0),
  salePrice: real('sale_price').notNull().default(0),
  status: text('status').notNull().default('available'),
});

export const credentialAssignments = sqliteTable('credential_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  credentialId: integer('credential_id').notNull(),
  orderId: text('order_id').notNull(),
  userId: integer('user_id').notNull(),
  productName: text('product_name').notNull().default(''),
  category: text('category').notNull().default(''),
  subcategory: text('subcategory').notNull().default(''),
  billingCycle: text('billing_cycle').notNull().default('once'),
  status: text('status').notNull().default('active'),
  assignedAt: text('assigned_at').notNull(),
  releasedAt: text('released_at'),
});

export const paymentQrs = sqliteTable('payment_qrs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  imageUrl: text('image_url'),
  status: text('status').notNull().default('active'),
});

export const notificationSettings = sqliteTable('notification_settings', {
  type: text('type').primaryKey(),
  recipientEmails: text('recipient_emails').notNull().default(''),
  enabled: integer('enabled').notNull().default(1),
  updatedAt: text('updated_at'),
});

export const orderNotifications = sqliteTable('order_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: text('order_id').notNull(),
  type: text('type').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message').notNull().default(''),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
});

export const homepageDisplaySettings = sqliteTable('homepage_display_settings', {
  id: integer('id').primaryKey(),
  configJson: text('config_json').notNull(),
  updatedAt: text('updated_at'),
});

export const emailConfig = sqliteTable('email_config', {
  id: integer('id').primaryKey(),
  provider: text('provider').notNull().default('smtp'),
  fromAddress: text('from_address').notNull().default(''),
  smtpHost: text('smtp_host').notNull().default(''),
  smtpPort: integer('smtp_port').notNull().default(465),
  smtpSecurity: text('smtp_security').notNull().default('tls'),
  smtpUsername: text('smtp_username').notNull().default(''),
  smtpPassword: text('smtp_password').notNull().default(''),
  imapHost: text('imap_host').notNull().default(''),
  imapPort: integer('imap_port').notNull().default(993),
  imapSecurity: text('imap_security').notNull().default('tls'),
  imapUsername: text('imap_username').notNull().default(''),
  imapPassword: text('imap_password').notNull().default(''),
  updatedAt: text('updated_at'),
});

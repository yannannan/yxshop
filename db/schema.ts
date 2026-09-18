import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone: text('phone').notNull().unique(),
  email: text('email').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
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

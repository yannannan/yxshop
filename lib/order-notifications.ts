import { env } from '@/db/mysql-runtime';
import nodemailer from 'nodemailer';

export type OrderNotificationType = 'payment' | 'delivery';

type OrderNotice = {
  id: string;
  product_name: string;
  category: string;
  amount: number;
  phone: string;
  email: string;
  created_at: string;
  status: string;
};

const statusLines = '待支付、已支付、待发货、已发货、已作废';
const typeLabel: Record<OrderNotificationType, string> = { payment: '下单支付通知', delivery: '发货通知' };
const statusLabel: Record<string, string> = { pending: '待支付', paid: '已支付', pending_delivery: '待发货', delivered: '已发货', closed: '已作废' };

export async function sendOrderNotification(type: OrderNotificationType, order: OrderNotice) {
  const setting = await env.DB.prepare('SELECT recipient_emails,enabled FROM notification_settings WHERE type=?').bind(type).first<{ recipient_emails: string; enabled: number }>();
  if (!setting || !setting.enabled) return;
  const recipients = setting.recipient_emails.split(/[，,;；\s]+/).map((value) => value.trim().toLowerCase()).filter((value, index, values) => /^\S+@\S+\.\S+$/.test(value) && values.indexOf(value) === index);
  const now = new Date().toISOString();
  for (const recipient of recipients) {
    const existing = await env.DB.prepare('SELECT status FROM order_notifications WHERE order_id=? AND type=? AND recipient_email=?').bind(order.id, type, recipient).first<{ status: string }>();
    if (existing?.status === 'sent') continue;
    if (existing) await env.DB.prepare("UPDATE order_notifications SET status='pending',error_message='',created_at=? WHERE order_id=? AND type=? AND recipient_email=?").bind(now, order.id, type, recipient).run();
    else await env.DB.prepare("INSERT INTO order_notifications (order_id,type,recipient_email,status,error_message,created_at) VALUES (?,?,?,'pending','',?)").bind(order.id, type, recipient, now).run();
    const subject = `【宇星商城】${typeLabel[type]} - ${order.id}`;
    const content = [
      typeLabel[type],
      `订单编号：${order.id}`,
      `商品：${order.product_name}`,
      `产品类型：${order.category || '—'}`,
      `金额：¥${order.amount}`,
      `客户手机号：${order.phone}`,
      `客户邮箱：${order.email}`,
      `当前状态：${statusLabel[order.status] || order.status}`,
      `下单时间：${order.created_at}`,
      '',
      `回复本邮件时请仅回复以下一个状态，以便系统更新订单：${statusLines}。`,
    ].join('\n');
    try {
      await sendConfiguredEmail(recipient, subject, content);
      await env.DB.prepare("UPDATE order_notifications SET status='sent',sent_at=?,error_message='' WHERE order_id=? AND type=? AND recipient_email=?").bind(new Date().toISOString(), order.id, type, recipient).run();
    } catch (error) {
      await env.DB.prepare("UPDATE order_notifications SET status='failed',error_message=? WHERE order_id=? AND type=? AND recipient_email=?").bind(error instanceof Error ? error.message : '邮件发送失败', order.id, type, recipient).run();
    }
  }
}

export async function sendConfiguredEmail(to: string, subject: string, text: string) {
  const config = await env.DB.prepare('SELECT provider,from_address,smtp_host,smtp_port,smtp_security,smtp_username,smtp_password FROM email_config WHERE id=1').first<EmailConfig>();
  if (config?.provider === 'smtp') await sendSmtpEmail(config, to, subject, text);
  else await sendResendEmail(to, subject, text, config?.from_address || env.NOTIFICATION_FROM || '');
}

type EmailConfig = { provider: string; from_address: string; smtp_host: string; smtp_port: number; smtp_security: string; smtp_username: string; smtp_password: string };

async function sendResendEmail(to: string, subject: string, text: string, from: string) {
  if (!env.RESEND_API_KEY || !from) throw new Error('未配置 Resend 发信密钥或发件人');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'user-agent': 'UniverseStar-Shop/1.0' }, body: JSON.stringify({ from, to: [to], subject, text }) });
  if (!response.ok) throw new Error((await response.text()).slice(0, 240));
}

async function sendSmtpEmail(config: EmailConfig, to: string, subject: string, text: string) {
  if (!config.from_address || !config.smtp_host || !config.smtp_username || !config.smtp_password) throw new Error('SMTP 配置不完整');
  const transporter = nodemailer.createTransport({ host: config.smtp_host, port: Number(config.smtp_port) || 465, secure: config.smtp_security !== 'starttls', auth: { user: config.smtp_username, pass: config.smtp_password } });
  await transporter.sendMail({ from: config.from_address, to, subject, text });
}

export const replyStatusMap: Record<string, string> = { 待支付: 'pending', 已支付: 'paid', 待发货: 'pending_delivery', 已发货: 'delivered', 已作废: 'closed' };

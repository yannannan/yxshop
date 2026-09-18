declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PRODUCT_IMAGES: R2Bucket;
    RESEND_API_KEY?: string;
    NOTIFICATION_FROM?: string;
    ORDER_REPLY_TOKEN?: string;
  }
}

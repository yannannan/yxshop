"use client";

import Image from "next/image";
import Link from "next/link";
import { billingCyclePriceText, defaultBillingCycle, parseProductAttributes, type CatalogProduct } from "../lib/catalog";

export function StoreProductCard({ product, onOrder }: { product: CatalogProduct; onOrder?: (id: number) => void }) {
    return (
      <article
        className="product-card refined-card"
        key={product.id}
        role="link"
        tabIndex={0}
        aria-label={`查看${product.name}详情`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a,button")) return;
          window.location.assign(`/product/${product.id}`);
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            !(event.target as HTMLElement).closest("a,button")
          ) {
            event.preventDefault();
            window.location.assign(`/product/${product.id}`);
          }
        }}
      >
        <Link
          className={`product-visual ${product.tone}${product.coverImage ? " has-upload-image" : ""}`}
          href={`/product/${product.id}`}
          aria-label={`查看${product.name}详情`}
        >
          <span className="badge">热销</span>
          {product.coverImage ? (
            <Image
              className="product-upload-image"
              unoptimized
              src={product.coverImage}
              alt={product.name}
              fill
              sizes="(max-width: 550px) 100vw, (max-width: 800px) 50vw, 25vw"
            />
          ) : (
            <span className="product-logo">{product.initial}</span>
          )}
          <span className="visual-arrow">查看详情 →</span>
        </Link>
        <div className="product-info">
          <div className="product-meta">
            <span>
              {[product.category, product.subcategory].filter(Boolean).join(' · ')}
            </span>
            <i>库存充足</i>
          </div>
          <h3>
            <Link href={`/product/${product.id}`}>{product.name}</Link>
          </h3>
          <p>{product.desc}</p>
          <div className="delivery-note">
            <span>✓</span> 支付后自动发至订单邮箱
          </div>
          <div className="product-attribute-tags">
            {parseProductAttributes(product.attributesJson)
              .slice(0, 3)
              .map((attribute) => (
                <span key={attribute.name}>
                  {attribute.name}：{attribute.value}
                </span>
              ))}
          </div>
          <div className="buy-row">
            <div>
              <strong>
                <small>¥</small>
                {product.price}
                <em className="price-cycle">
                  {billingCyclePriceText(
                    product.billingCycle || defaultBillingCycle(product.id),
                  )}
                </em>
              </strong>
              <del>¥{product.oldPrice}</del>
            </div>
            <button onClick={() => onOrder ? onOrder(product.id) : window.location.assign(`/product/${product.id}`)}>立即下单</button>
          </div>
        </div>
      </article>
    );
  }

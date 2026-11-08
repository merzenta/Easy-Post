-- CreateTable
CREATE TABLE "merchant_settings" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "api_key_encrypted" TEXT NOT NULL,
    "webhook_secret" TEXT,
    "default_label_format" TEXT NOT NULL DEFAULT 'PDF',
    "merchant_location" JSONB NOT NULL,
    "package_presets" JSONB NOT NULL DEFAULT '[]',
    "enabled_carriers" JSONB NOT NULL DEFAULT '["USPS", "FedEx", "UPS", "DHL"]',
    "carrier_accounts" JSONB NOT NULL DEFAULT '[]',
    "handling_fee_type" TEXT NOT NULL DEFAULT 'NONE',
    "handling_fee_value" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "free_shipping_threshold" DOUBLE PRECISION,
    "fallback_rate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "default_item_weight_oz" DOUBLE PRECISION NOT NULL DEFAULT 16.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "wix_order_id" TEXT NOT NULL,
    "easypost_shipment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "rate_id" TEXT,
    "rate_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rate_currency" TEXT NOT NULL DEFAULT 'USD',
    "tracking_code" TEXT,
    "tracker_id" TEXT,
    "wix_fulfillment_id" TEXT,
    "sender_address" JSONB NOT NULL,
    "recipient_address" JSONB NOT NULL,
    "parcel_data" JSONB NOT NULL,
    "customs_info" JSONB,
    "rates_data" JSONB,
    "label_url" TEXT,
    "label_format" TEXT NOT NULL DEFAULT 'PDF',
    "scan_form_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weight_oz" DOUBLE PRECISION NOT NULL,
    "length_in" DOUBLE PRECISION,
    "width_in" DOUBLE PRECISION,
    "height_in" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_form_orders" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "easypost_scan_form_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "form_url" TEXT,
    "form_file_type" TEXT DEFAULT 'PDF',
    "shipment_count" INTEGER NOT NULL DEFAULT 0,
    "tracking_codes" JSONB NOT NULL DEFAULT '[]',
    "batch_id" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_form_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_records" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "easypost_tracker_id" TEXT,
    "carrier" TEXT NOT NULL DEFAULT 'USPS',
    "status" TEXT NOT NULL,
    "status_detail" TEXT,
    "public_url" TEXT,
    "est_delivery_date" TEXT,
    "events" JSONB NOT NULL DEFAULT '[]',
    "is_delivered" BOOLEAN NOT NULL DEFAULT false,
    "has_exception" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_subscriptions" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "plan_type" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthly_quota" INTEGER NOT NULL DEFAULT 5,
    "price_monthly" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "wix_package_id" TEXT,
    "wix_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_usages" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "billing_cycle_key" TEXT NOT NULL,
    "labels_generated" INTEGER NOT NULL DEFAULT 0,
    "last_label_generated_at" TIMESTAMP(3),
    "subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_usage_logs" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "tracking_code" TEXT,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "rate_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "plan_type" TEXT NOT NULL,
    "quota_count_after" INTEGER NOT NULL,
    "subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_settings_instance_id_key" ON "merchant_settings"("instance_id");

-- CreateIndex
CREATE INDEX "merchant_settings_instance_id_idx" ON "merchant_settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_easypost_shipment_id_key" ON "shipments"("easypost_shipment_id");

-- CreateIndex
CREATE INDEX "shipments_instance_id_status_idx" ON "shipments"("instance_id", "status");

-- CreateIndex
CREATE INDEX "shipments_instance_id_wix_order_id_idx" ON "shipments"("instance_id", "wix_order_id");

-- CreateIndex
CREATE INDEX "shipments_instance_id_scan_form_id_idx" ON "shipments"("instance_id", "scan_form_id");

-- CreateIndex
CREATE INDEX "shipments_tracking_code_idx" ON "shipments"("tracking_code");

-- CreateIndex
CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_form_orders_easypost_scan_form_id_key" ON "scan_form_orders"("easypost_scan_form_id");

-- CreateIndex
CREATE INDEX "scan_form_orders_instance_id_created_at_idx" ON "scan_form_orders"("instance_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_records_tracking_code_key" ON "tracking_records"("tracking_code");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_records_easypost_tracker_id_key" ON "tracking_records"("easypost_tracker_id");

-- CreateIndex
CREATE INDEX "tracking_records_instance_id_is_delivered_idx" ON "tracking_records"("instance_id", "is_delivered");

-- CreateIndex
CREATE INDEX "tracking_records_instance_id_has_exception_idx" ON "tracking_records"("instance_id", "has_exception");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_subscriptions_instance_id_key" ON "merchant_subscriptions"("instance_id");

-- CreateIndex
CREATE INDEX "merchant_subscriptions_instance_id_status_idx" ON "merchant_subscriptions"("instance_id", "status");

-- CreateIndex
CREATE INDEX "monthly_usages_instance_id_billing_cycle_key_idx" ON "monthly_usages"("instance_id", "billing_cycle_key");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_usages_instance_id_billing_cycle_key_key" ON "monthly_usages"("instance_id", "billing_cycle_key");

-- CreateIndex
CREATE INDEX "subscription_usage_logs_instance_id_created_at_idx" ON "subscription_usage_logs"("instance_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_usage_logs_shipment_id_idx" ON "subscription_usage_logs"("shipment_id");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_scan_form_id_fkey" FOREIGN KEY ("scan_form_id") REFERENCES "scan_form_orders"("easypost_scan_form_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_usages" ADD CONSTRAINT "monthly_usages_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "merchant_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usage_logs" ADD CONSTRAINT "subscription_usage_logs_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "merchant_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

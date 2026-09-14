INSERT INTO "membership_plans" (
    "id",
    "name",
    "productIdentifier",
    "entitlementIdentifier",
    "description",
    "active",
    "updatedAt"
)
VALUES
    (
        'b7e7e4d1-3d6d-4b77-8f20-4be8e1f1a101',
        'Business Monthly',
        'wspread_business_monthly',
        'business',
        'W-Spread Business monthly membership',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        'b7e7e4d1-3d6d-4b77-8f20-4be8e1f1a102',
        'Business Yearly',
        'wspread_business_yearly',
        'business',
        'W-Spread Business yearly membership',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        'b7e7e4d1-3d6d-4b77-8f20-4be8e1f1a103',
        'Enterprise Monthly',
        'wspread_enterprise_monthly',
        'enterprise',
        'W-Spread Enterprise monthly membership',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        'b7e7e4d1-3d6d-4b77-8f20-4be8e1f1a104',
        'Enterprise Yearly',
        'wspread_enterprise_yearly',
        'enterprise',
        'W-Spread Enterprise yearly membership',
        true,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("productIdentifier") DO UPDATE
SET
    "name" = EXCLUDED."name",
    "entitlementIdentifier" = EXCLUDED."entitlementIdentifier",
    "description" = EXCLUDED."description",
    "active" = EXCLUDED."active",
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "membership_subscriptions" AS subscription
SET "planId" = plan."id"
FROM "membership_plans" AS plan
WHERE subscription."productIdentifier" = plan."productIdentifier"
  AND subscription."planId" IS NULL;

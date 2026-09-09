# Data Model

## Existing entity

- `User`: UUID primary key, unique email, optional name, role, timestamps.

## Added identity and access entities

- `AuthAccount`: links a user to an external provider account; Google is represented by `(provider, providerAccountId)`.
- `Session`: stores a hash of a server-issued session token, expiry, revocation, and usage timestamps.

## Added membership entities

- `MembershipPlan`: internal catalog mapping to RevenueCat product and entitlement identifiers.
- `MembershipSubscription`: current/historical subscription state linked to a user and optional internal plan.
- `RevenueCatEvent`: immutable webhook event record keyed by RevenueCat event ID for idempotent processing.

## Relationship summary

- User 1-to-many AuthAccount, Session, MembershipSubscription, and RevenueCatEvent.
- MembershipPlan 1-to-many MembershipSubscription.
- RevenueCat app user IDs are stored on User and subscription/event records to reconcile webhook payloads.

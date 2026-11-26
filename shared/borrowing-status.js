// Shared borrowing vocabulary. All portals use the same canonical statuses so
// a request in one screen is accounted for the same way everywhere.
export const BORROWING_STATUSES = [
  "pending", "approved", "active", "borrowed", "returned",
  "overdue", "rejected", "cancelled"
];

export const REVIEW_STATUSES = ["pending", "approved"];
export const ACTIVE_STATUSES = ["active", "borrowed", "overdue"];
export const CLOSED_STATUSES = ["returned", "rejected", "cancelled"];

export const normalizeBorrowingStatus = (value) => {
  const status = String(value ?? "").trim().toLowerCase();
  return BORROWING_STATUSES.includes(status) ? status : "pending";
};

export const statusLabel = (value) => normalizeBorrowingStatus(value).toUpperCase();

export const isReviewStatus = (value) => REVIEW_STATUSES.includes(normalizeBorrowingStatus(value));
export const isActiveStatus = (value) => ACTIVE_STATUSES.includes(normalizeBorrowingStatus(value));
export const isClosedStatus = (value) => CLOSED_STATUSES.includes(normalizeBorrowingStatus(value));

// Older databases may contain capitalized status values. Include those variants
// in queries instead of silently hiding records that are still in the table.
export const statusQueryVariants = (statuses) => [
  ...new Set(statuses.flatMap((status) => [
    status,
    status.toUpperCase(),
    status.charAt(0).toUpperCase() + status.slice(1)
  ]))
];

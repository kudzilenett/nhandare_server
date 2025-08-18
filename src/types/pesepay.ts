// Pesepay Integration Types for Zimbabwe Payment Processing

export interface PaymentRequest {
  amount: number;
  userId: string;
  email: string;
  phoneNumber: string;
  customerName: string;
  paymentMethodCode: string;
  paymentMethodFields?: Record<string, any>;
  isCardPayment?: boolean;
  resultUrl?: string;
  returnUrl?: string;
}

// PaymentBody interface as expected by pesepayclient InitiatePayment function
export interface PaymentBody {
  amountDetails: {
    amount: number;
    currencyCode: string;
  };
  reasonForPayment: string;
  resultUrl: string;
  returnUrl: string;
  merchantReference?: string;
  paymentMethodCode?: string;
  customer?: {
    email: string;
    phoneNumber: string;
    name: string;
  };
  paymentMethodRequiredFields?: Record<string, any>;
  termsAndConditionsUrl?: string;
}

// TransactionDetails interface from pesepayclient package
// Note: Some fields may be optional or undefined depending on the payment stage/status
export interface TransactionDetails {
  amountDetails?: {
    amount: number;
    currencyCode: string;
    customerPayableAmount?: number;
    defaultCurrencyAmount?: number;
    defaultCurrencyCode?: string;
    formattedMerchantAmount?: string;
    merchantAmount?: number;
    totalTransactionAmount?: number;
    transactionServiceFee?: number;
  };
  applicationCode?: string;
  applicationName?: string;
  chargeType?:
    | "NO_CHARGE"
    | "SHARED_TRANSACTIONAL_CHARGE"
    | "TRANSACTIONAL_CHARGE_FOR_CUSTOMER"
    | "TRANSACTIONAL_CHARGE_FOR_MERCHANT"
    | string;
  customer?: {
    contactNumbers?: string[];
    email?: string;
    name?: string;
  };
  customerAmountPaid?: {
    amountPaid: number;
    currencyCode: string;
  };
  dateOfTransaction?: string;
  id?: number;
  internalReference?: string;
  liquidationStatus?:
    | "COMPLETED"
    | "DUE_FOR_LIQUIDATION"
    | "IN_PROGRESS"
    | "NO_LIQUIDATION_REQUIRED"
    | "PENDING"
    | "WAITING_FOR_DETERMINATION"
    | string;
  liquidationTransactionReference?: string;
  localDateTimeOfTransaction?: string;
  merchantReference?: string;
  paymentMetadata?: Record<string, any>;
  paymentMethodDetails?: {
    paymentMethodCode: string;
    paymentMethodId?: number;
    paymentMethodMessage?: string;
    paymentMethodName: string;
    paymentMethodReference?: string;
    paymentMethodStatus?: string;
  };
  pollUrl?: string;
  reasonForPayment?: string;
  redirectRequired?: boolean;
  redirectUrl?: string;
  referenceNumber: string; // This should always be present
  resultUrl?: string;
  returnUrl?: string;
  settlementMode?: "DIRECTLY_SETTLED" | string; // Note: Official docs show this as string despite description mentioning boolean
  timeOfTransaction?: string;
  transactionDate?: string;
  transactionStatus?:
    | "AUTHORIZATION_FAILED"
    | "CANCELLED"
    | "CLOSED"
    | "CLOSED_PERIOD_ELAPSED"
    | "DECLINED"
    | "ERROR"
    | "FAILED"
    | "INITIATED"
    | "INSUFFICIENT_FUNDS"
    | "PARTIALLY_PAID"
    | "PENDING"
    | "PROCESSING"
    | "REVERSED"
    | "SERVICE_UNAVAILABLE"
    | "SUCCESS"
    | "TERMINATED"
    | "TIME_OUT"
    | string;
  transactionStatusCode?: number;
  transactionStatusDescription?: string;
  transactionType?: "BASIC" | "INVOICE" | string;
}

export interface PaymentMethod {
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  minAmount?: number;
  maxAmount?: number;
  requiredFields?: string[];
}

// PaymentResponse - simplified response for internal use
export interface PaymentResponse {
  success: boolean;
  referenceNumber: string;
  redirectUrl?: string;
  transactionStatus: string;
  message?: string;
  isHostedCheckout?: boolean;
  redirectRequired?: boolean;

  // Additional useful fields from TransactionDetails
  pollUrl?: string;
  paymentMethodDetails?: {
    paymentMethodCode: string;
    paymentMethodName: string;
    paymentMethodMessage: string;
  };
}

// PaymentStatusResponse - simplified status response
export interface PaymentStatusResponse {
  success: boolean;
  referenceNumber: string;
  transactionStatus: string;
  message?: string;
  amountDetails?: {
    amount: number;
    currencyCode: string;
  };
  paidAt?: string;
  failureReason?: string;
}

export interface GroupedPaymentMethods {
  cardMethods: PaymentMethod[];
  mobileOnlyMethods: PaymentMethod[];
  allMethods: PaymentMethod[];
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

// Tournament Payment Request Types
export interface TournamentPaymentRequest {
  tournamentId: string;
  paymentMethodCode: string;
  mobileMoneyNumber?: string;
  returnUrl: string;
  resultUrl: string;
}

// Prize Payout Types
export interface PrizePayoutRequest {
  userId: string;
  amount: number;
  tournamentId: string;
  mobileMoneyNumber: string;
  paymentMethodCode: string;
}

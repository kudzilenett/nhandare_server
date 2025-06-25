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

export interface PaymentBody {
  amountDetails: {
    amount: number;
    currencyCode: string;
  };
  merchantReference: string;
  reasonForPayment: string;
  paymentMethodCode: string;
  customer: {
    email: string;
    phoneNumber: string;
    name: string;
  };
  paymentMethodRequiredFields?: Record<string, any>;
  resultUrl: string;
  returnUrl: string;
  termsAndConditionsUrl?: string;
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

export interface PaymentResponse {
  // Pesepay standard response fields
  success?: boolean;
  message?: string;
  transactionId?: string;
  referenceNumber?: string;
  paymentUrl?: string;
  status?: string;
  isHostedCheckout?: boolean;
  pollUrl?: string;
  redirectUrl?: string;

  // Additional fields from Pesepay API
  amountDetails?: any;
  customer?: any;
  merchant?: any;
  paymentMethod?: any;
  transactionReference?: string;
  resultUrl?: string;
  returnUrl?: string;
  transactionStatus?: string;

  // Allow any additional fields from Pesepay
  [key: string]: any;
}

export interface PaymentStatusResponse {
  success?: boolean;
  status?: string;
  transactionId?: string;
  referenceNumber?: string;
  amount?: number;
  currencyCode?: string;
  paidAt?: string;
  failureReason?: string;

  // Allow any additional fields from Pesepay status response
  [key: string]: any;
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

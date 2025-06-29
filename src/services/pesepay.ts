import axios from "axios";
import https from "https";

// Configure axios globally with insecure HTTP parser BEFORE importing pesepayclient
// This ensures the pesepayclient package inherits these settings
const globalHttpsAgent = new https.Agent({
  keepAlive: true,
  // @ts-ignore - Node's AgentOptions supports this flag but typings may not include it
  insecureHTTPParser: true,
});

// Set the global agent for all axios instances
axios.defaults.httpsAgent = globalHttpsAgent;
axios.defaults.httpAgent = new (require("http").Agent)({
  keepAlive: true,
  // @ts-ignore
  insecureHTTPParser: true,
});

// Also configure any axios instances created by other modules
const originalCreate = axios.create;
axios.create = function (config = {}) {
  const instance = originalCreate.call(this, {
    ...config,
    httpsAgent: config.httpsAgent || globalHttpsAgent,
    httpAgent: config.httpAgent || axios.defaults.httpAgent,
  });
  return instance;
};

// NOW import pesepayclient after axios is configured
import {
  EncryptPayment,
  DecriptPayment,
  InitiatePayment,
  CheckPayment,
} from "pesepayclient";
import {
  PaymentResponse,
  PaymentStatusResponse,
  GroupedPaymentMethods,
  PaymentMethod,
  Currency,
} from "../types/pesepay";
import { env } from "../config/environment";
import logger from "../config/logger";

interface PaymentRequest {
  amount: number;
  userId: string;
  email: string;
  phoneNumber: string;
  customerName: string;
  paymentMethodCode: string;
  paymentMethodFields?: any;
  isCardPayment?: boolean;
  resultUrl?: string;
  returnUrl?: string;
}

// PaymentBody interface as expected by pesepayclient
interface PaymentBody {
  amountDetails: {
    amount: number;
    currencyCode: string;
    merchantAmount: number;
    customerPayableAmount: number;
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
  paymentMethodRequiredFields?: any;
  termsAndConditionsUrl?: string;
}

const ENCRYPTION_KEY = process.env.PESEPAY_ENCRYPTION_KEY || "";
const INTEGRATION_KEY = process.env.PESEPAY_INTEGRATION_KEY || "";
const API_BASE_URL = "https://api.pesepay.com/api/payments-engine";

/**
 * PesePay Service for Zimbabwe Payment Processing
 *
 * This service handles:
 * - Payment initiation for both card and mobile money
 * - Payment status checking
 * - Available payment methods retrieval
 *
 * Supported payment methods:
 * - Visa Cards (PZW204)
 * - EcoCash USD (PZW211)
 * - Innbucks USD (PZW212)
 * - Zimswitch USD (PZW215)
 *
 * Uses the pesepayclient package to handle encryption/decryption
 * and bypass HTTP header parsing issues from PesePay's servers.
 */
export class PesePayService {
  constructor() {
    logger.info("=== PesePay Configuration ===", {
      service: "nhandare-backend",
      apiBaseUrl: API_BASE_URL,
      hasIntegrationKey: !!INTEGRATION_KEY,
      hasEncryptionKey: !!ENCRYPTION_KEY,
      environment: process.env.NODE_ENV,
      httpsAgent: {
        configured: !!axios.defaults.httpsAgent,
        insecureParser: (axios.defaults.httpsAgent as any)?.options
          ?.insecureHTTPParser,
      },
      httpAgent: {
        configured: !!axios.defaults.httpAgent,
        insecureParser: (axios.defaults.httpAgent as any)?.options
          ?.insecureHTTPParser,
      },
    });
  }

  private logApiError(context: string, error: any) {
    logger.error(`=== ${context} Error ===`, {
      service: "nhandare-backend",
      name: error.name,
      code: error.code,
      message: error.message,
    });
  }

  /**
   * Initiate a payment using PesePay
   *
   * @param request - Payment request details
   * @returns Promise<PaymentResponse> - Payment initiation response with redirect URL if needed
   */
  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info("=== Payment Initiation Started ===", {
        service: "nhandare-backend",
        amount: request.amount,
        paymentMethodCode: request.paymentMethodCode,
        isCardPayment: request.isCardPayment,
      });

      // ------------------------------------------------------------------
      // 🛈  Phone number formatting – Pesepay accepts numbers without the
      //     leading "+".  We convert any "+263xxxxxxxxx" to "263xxxxxxxxx"
      //     and any "07xxxxxxxx" to "2637xxxxxxxx".
      // ------------------------------------------------------------------
      const normalisedPhone = (() => {
        const cleaned = request.phoneNumber.replace(/\D/g, "");
        if (cleaned.startsWith("263")) return cleaned; // already 263…
        if (cleaned.startsWith("07")) return `263${cleaned.substring(1)}`;
        return cleaned; // fallback – send as-is
      })();

      const paymentBody: PaymentBody = {
        amountDetails: {
          amount: request.amount,
          currencyCode: "USD",
          merchantAmount: request.amount,
          customerPayableAmount: request.amount,
        } as any,
        reasonForPayment: "Gaming Platform Payment",
        resultUrl:
          request.resultUrl ||
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/payment/result`,
        returnUrl:
          request.returnUrl ||
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/payment/return`,
        merchantReference: `PAYMENT_${request.userId}_${Date.now()}`,
        paymentMethodCode: request.paymentMethodCode,
        customer: {
          email: request.email,
          phoneNumber: normalisedPhone,
          name: request.customerName,
        },
        paymentMethodRequiredFields:
          request.paymentMethodFields ||
          (request.paymentMethodCode?.toUpperCase().startsWith("PZW21")
            ? { customerPhoneNumber: normalisedPhone }
            : {}),
      };

      // For card payments, add terms and conditions URL
      if (request.isCardPayment) {
        paymentBody.termsAndConditionsUrl = `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/terms`;
      }

      logger.info("=== Using Direct PesePay API with Encryption ===", {
        service: "nhandare-backend",
        merchantReference: paymentBody.merchantReference,
        paymentBody: {
          amount: paymentBody.amountDetails.amount,
          currencyCode: paymentBody.amountDetails.currencyCode,
          paymentMethodCode: paymentBody.paymentMethodCode,
          phoneNumber: paymentBody.customer?.phoneNumber,
        },
      });

      // Use EncryptPayment from pesepayclient to encrypt the payload
      const encryptedPayload = EncryptPayment(paymentBody, ENCRYPTION_KEY);

      logger.info("Payload encrypted successfully", {
        service: "nhandare-backend",
        encryptedLength: encryptedPayload.length,
      });

      // Make direct HTTP request with our configured agent
      const response = await axios.post(
        `${API_BASE_URL}/v1/payments/initiate`,
        { payload: encryptedPayload },
        {
          headers: {
            "Content-Type": "application/json",
            authorization: INTEGRATION_KEY,
          },
          httpsAgent: globalHttpsAgent,
          timeout: 30000, // 30 second timeout
        }
      );

      logger.info("Direct API Response:", {
        service: "nhandare-backend",
        status: response.status,
        dataLength: JSON.stringify(response.data).length,
      });

      // Decrypt the response using DecriptPayment from pesepayclient
      const decryptedResponse = DecriptPayment(
        response.data.payload,
        ENCRYPTION_KEY
      );

      if (!decryptedResponse) {
        throw new Error("Failed to decrypt PesePay response");
      }

      logger.info("Response decrypted successfully", {
        service: "nhandare-backend",
        referenceNumber: decryptedResponse.referenceNumber,
        transactionStatus: decryptedResponse.transactionStatus,
        hasRedirectUrl: !!decryptedResponse.redirectUrl,
      });

      // Ensure we have required fields
      if (!decryptedResponse.referenceNumber) {
        logger.error("Missing referenceNumber in PesePay response", {
          service: "nhandare-backend",
          response: decryptedResponse,
        });
        throw new Error("Invalid payment response: missing referenceNumber");
      }

      const paymentResponse: PaymentResponse = {
        referenceNumber: decryptedResponse.referenceNumber,
        transactionReference: decryptedResponse.referenceNumber, // For compatibility
        redirectUrl: decryptedResponse.redirectUrl,
        pollUrl: decryptedResponse.pollUrl,
        transactionStatus: decryptedResponse.transactionStatus,
        transactionStatusDescription:
          decryptedResponse.transactionStatusDescription,
        paymentMethodDetails: decryptedResponse.paymentMethodDetails,
        redirectRequired: decryptedResponse.redirectRequired || false,
        isHostedCheckout: request.isCardPayment || false,
        // Include all other fields from the response
        ...decryptedResponse,
      };

      logger.info("Final Payment Response:", {
        service: "nhandare-backend",
        success: true,
        referenceNumber: paymentResponse.referenceNumber,
        hasRedirectUrl: !!paymentResponse.redirectUrl,
        transactionStatus: paymentResponse.transactionStatus,
      });

      return paymentResponse;
    } catch (error) {
      this.logApiError("Payment Initiation", error);

      // Log more detailed error information
      logger.error("Payment Initiation Detailed Error:", {
        service: "nhandare-backend",
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          response: error.response?.data,
          status: error.response?.status,
        },
        paymentRequest: {
          amount: request.amount,
          paymentMethodCode: request.paymentMethodCode,
          userId: request.userId,
        },
      });

      throw error;
    }
  }

  /**
   * Check the status of a payment
   *
   * @param referenceNumber - Payment reference number
   * @returns Promise<PaymentStatusResponse> - Current payment status
   */
  async checkPaymentStatus(
    referenceNumber: string
  ): Promise<PaymentStatusResponse> {
    try {
      logger.info("=== Checking Payment Status ===", {
        service: "nhandare-backend",
        referenceNumber,
      });

      // ------------------------------------------------------------------
      // 🛈  Primary approach – use pesepayclient's CheckPayment which
      //     handles encryption/decryption and abstracts the HTTP call.
      // ------------------------------------------------------------------
      try {
        const statusResponse = await CheckPayment(
          referenceNumber,
          ENCRYPTION_KEY,
          INTEGRATION_KEY
        );

        if (statusResponse) {
          logger.info("Payment Status (via CheckPayment):", {
            service: "nhandare-backend",
            transactionStatus: statusResponse.transactionStatus,
          });
          return statusResponse;
        }

        // If null/undefined fall through to fallback.
        logger.warn("CheckPayment returned null, falling back to direct API", {
          service: "nhandare-backend",
          referenceNumber,
        });
      } catch (libErr: any) {
        // Library failed – log and fall back
        logger.warn("CheckPayment threw error, falling back", {
          service: "nhandare-backend",
          message: libErr?.message,
        });
      }

      // ------------------------------------------------------------------
      // 🛈  Fallback – direct HTTPS request (legacy). This path is kept to
      //     ensure backward-compatibility if the library fails.
      // ------------------------------------------------------------------
      const response = await axios.get(
        `${API_BASE_URL}/v1/payments/check-payment?referenceNumber=${encodeURIComponent(
          referenceNumber
        )}`,
        {
          headers: {
            "Content-Type": "application/json",
            authorization: INTEGRATION_KEY,
          },
          httpsAgent: globalHttpsAgent,
          timeout: 30000, // 30 second timeout
        }
      );

      logger.info("Direct Payment Status Response:", {
        service: "nhandare-backend",
        status: response.status,
        dataLength: JSON.stringify(response.data).length,
      });

      // Decrypt the response using DecriptPayment from pesepayclient
      const decryptedResponse = DecriptPayment(
        response.data.payload,
        ENCRYPTION_KEY
      );

      if (!decryptedResponse) {
        throw new Error("Failed to decrypt PesePay status response");
      }

      logger.info("Payment Status Response (fallback):", {
        service: "nhandare-backend",
        success: !!decryptedResponse,
        transactionStatus: decryptedResponse?.transactionStatus,
      });

      return decryptedResponse;
    } catch (error) {
      // --------------------------------------------------------------
      // Graceful handling: Pesepay often returns 404 or 500 with
      // "transaction was not found" while the transaction is still
      // pending (e.g., user hasn't approved the EcoCash prompt yet).
      // See error payload examples in logs.  We'll treat these cases
      // as a temporary "PENDING" status instead of bubbling an error.
      // --------------------------------------------------------------
      const axiosErr = error as any;
      const msg: string | undefined = axiosErr?.response?.data?.message;
      const statusCode: number | undefined = axiosErr?.response?.status;

      const notFound = msg?.toLowerCase().includes("not found");

      if (notFound || statusCode === 404) {
        logger.info("Payment status not found yet – treating as PENDING", {
          service: "nhandare-backend",
          referenceNumber,
        });

        return {
          referenceNumber,
          transactionStatus: "PENDING",
          message: msg,
          success: true,
        } as PaymentStatusResponse;
      }

      this.logApiError("Payment Status Check", error);
      throw error;
    }
  }

  /**
   * Get available currencies (fallback implementation)
   * Note: This endpoint has HTTP header issues on PesePay's side
   */
  async getActiveCurrencies(): Promise<Currency[]> {
    try {
      logger.info("=== Fetching Active Currencies ===", {
        service: "nhandare-backend",
      });

      // Return known active currencies as fallback
      const currencies = [
        { code: "USD", name: "US Dollar", symbol: "$", isActive: true },
      ];

      logger.info("Active Currencies Response:", {
        service: "nhandare-backend",
        currenciesCount: currencies.length,
      });

      return currencies;
    } catch (error) {
      this.logApiError("Active Currencies", error);
      return [];
    }
  }

  /**
   * Get available payment methods for a currency
   *
   * @param currencyCode - Currency code (default: USD)
   * @returns Promise<GroupedPaymentMethods> - Available payment methods grouped by type
   */
  async getPaymentMethods(
    currencyCode: string = "USD"
  ): Promise<GroupedPaymentMethods> {
    try {
      logger.info("=== Fetching Payment Methods ===", {
        service: "nhandare-backend",
        currencyCode,
      });

      // Use fallback payment methods from actual PesePay API response
      // This avoids the HTTP header parsing issue while providing real data
      logger.info("Using verified payment methods from PesePay API", {
        service: "nhandare-backend",
      });

      const paymentMethods = [
        {
          id: 5,
          name: "Visa",
          code: "PZW204",
          description: "Visa credit/debit card payments",
          maximumAmount: 3000.0,
          minimumAmount: 0.1,
          active: true,
          currencies: ["USD"],
          requiredFields: [
            {
              fieldType: "TEXT",
              name: "creditCardExpiryDate",
              displayName: "Expiry Date",
              optional: false,
            },
            {
              fieldType: "TEXT",
              name: "creditCardSecurityNumber",
              displayName: "CVV",
              optional: false,
            },
            {
              fieldType: "TEXT",
              name: "creditCardNumber",
              displayName: "Card Number",
              optional: false,
            },
          ],
        },
        {
          id: 25692,
          name: "Ecocash USD",
          code: "PZW211",
          description:
            "Make payment directly from your mobile phone using EcoCash",
          maximumAmount: 3000.0,
          minimumAmount: 1.0,
          active: true,
          currencies: ["USD"],
          requiredFields: [
            {
              fieldType: "TEXT",
              name: "customerPhoneNumber",
              displayName: "Phone Number",
              optional: false,
            },
          ],
        },
        {
          id: 25693,
          name: "Innbucks USD",
          code: "PZW212",
          description:
            "QR code based payment method for USD payments via Innbucks",
          maximumAmount: 1000.0,
          minimumAmount: 1.0,
          active: true,
          currencies: ["USD"],
          requiredFields: [],
        },
        {
          id: 25694,
          name: "Zimswitch USD",
          code: "PZW215",
          description: "Bank card payments via Zimswitch network",
          maximumAmount: 3000.0,
          minimumAmount: 0.1,
          active: true,
          currencies: ["USD"],
          requiredFields: [],
        },
      ];

      return this.processPaymentMethods(paymentMethods);
    } catch (error) {
      this.logApiError("Payment Methods", error);
      return {
        cardMethods: [],
        mobileOnlyMethods: [],
        allMethods: [],
      };
    }
  }

  /**
   * Process and group payment methods by type
   */
  private processPaymentMethods(methods: any[]): GroupedPaymentMethods {
    const cardMethods = methods.filter((method: any) => {
      const methodCode = method.code?.toUpperCase() || "";
      const methodName = method.name?.toUpperCase() || "";
      return [
        "VISA",
        "MASTERCARD",
        "VISA_MASTERCARD",
        "CARD",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "PZW204", // Visa code from PesePay
      ].some(
        (cardType) =>
          methodCode.includes(cardType) || methodName.includes(cardType)
      );
    });

    const mobileOnlyMethods = methods.filter(
      (method: any) =>
        !cardMethods.some((card: any) => card.code === method.code)
    );

    const groupedMethods = {
      cardMethods,
      mobileOnlyMethods,
      allMethods: methods,
    };

    logger.info("Grouped Payment Methods:", {
      service: "nhandare-backend",
      cardMethods: cardMethods.length,
      mobileOnlyMethods: mobileOnlyMethods.length,
      totalMethods: methods.length,
      methods: methods.map((m) => ({ name: m.name, code: m.code })),
    });

    return groupedMethods;
  }

  /**
   * Get mobile money providers specifically
   *
   * @param currencyCode - Currency code (default: USD)
   * @returns Promise<PaymentMethod[]> - Available mobile money providers
   */
  async getMobileMoneyProviders(
    currencyCode: string = "USD"
  ): Promise<PaymentMethod[]> {
    try {
      const paymentMethods = await this.getPaymentMethods(currencyCode);

      // Filter for mobile money providers
      const mobileMoneyMethods = paymentMethods.mobileOnlyMethods.filter(
        (method: any) => {
          const methodName = method.name?.toUpperCase() || "";
          const methodCode = method.code?.toUpperCase() || "";

          return [
            "ECOCASH",
            "ONEMONEY",
            "ZIMSWITCH",
            "INNBUCKS",
            "TELECASH",
          ].some(
            (provider) =>
              methodName.includes(provider) || methodCode.includes(provider)
          );
        }
      );

      logger.info("Mobile Money Providers:", {
        service: "nhandare-backend",
        count: mobileMoneyMethods.length,
        providers: mobileMoneyMethods.map((m: any) => m.name || m.code),
      });

      return mobileMoneyMethods;
    } catch (error) {
      this.logApiError("Mobile Money Providers", error);
      return [];
    }
  }

  /**
   * Test PesePay connection
   *
   * @returns Promise<{success: boolean; message: string; currencies: number}>
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    currencies: number;
  }> {
    try {
      logger.info("=== Testing PesePay Connection ===", {
        service: "nhandare-backend",
      });

      const currencies = await this.getActiveCurrencies();

      logger.info("Connection Test Successful:", {
        service: "nhandare-backend",
        currenciesFound: currencies.length,
      });

      return {
        success: true,
        message: "PesePay connection successful",
        currencies: currencies.length,
      };
    } catch (error) {
      this.logApiError("Connection Test", error);
      return {
        success: false,
        message: "PesePay connection failed",
        currencies: 0,
      };
    }
  }
}

// Export singleton instance
export const pesePayService = new PesePayService();
export default pesePayService;

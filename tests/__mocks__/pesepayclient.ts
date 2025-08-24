// Mock for pesepayclient module
export const EncryptPayment = jest.fn();
export const DecriptPayment = jest.fn();
export const InitiatePayment = jest.fn();
export const VerifyPayment = jest.fn();
export const GetPaymentStatus = jest.fn();

// Mock the default export
export default {
  EncryptPayment,
  DecriptPayment,
  InitiatePayment,
  VerifyPayment,
  GetPaymentStatus,
};

'use strict';

goog.require('i18n.phonenumbers.AsYouTypeFormatter');
goog.require('i18n.phonenumbers.PhoneNumberFormat');
goog.require('i18n.phonenumbers.PhoneNumberUtil');
goog.require('i18n.phonenumbers.PhoneNumberUtil.ValidationResult');

var phoneUtil = i18n.phonenumbers.PhoneNumberUtil.getInstance(),
    PNF = i18n.phonenumbers.PhoneNumberFormat,
    allRegionCodes, // region codes from metadata
    regionCode, // one region code to use for all functions
    formatter, // AsYouTypeFormatter
    statelessFormatter; // stateless AsYouTypeFormatter

var styles = {
    E164: 'e164',
    INTERNATIONAL: 'international',
    NATIONAL: 'national',
    RFC3966: 'rfc3966'
},
    errors = {
        FORMAT_INVALID: 'PHN_FORMAT_INVALID',
        INVALID_COUNTRY_CODE: 'PHN_COUNTRY_CODE_INVALID',
        INVALID_FOR_REGION: 'PHN_INVALID_FOR_REGION',
        INVALID_STYLE: 'PHN_OPTIONS_INVALID',
        MISSING_COUNTRY_CODE: 'PHN_COUNTRY_MISSING',
        MISSING_NATIONAL_NUMBER: 'PHN_NUMBER_EMPTY',
        NOT_A_NUMBER: 'PHN_NOT_A_NUMBER',
        NOT_A_STRING: 'PHN_EXTENSION_NOT_A_STRING',
        PARSE_ERROR: 'PHN_PARSE_ERROR',
        TOO_SHORT_AFTER_IDD: 'PHN_NUMBER_TOO_SHORT_AFTER_IDD',
        TOO_SHORT_NSN: 'PHN_NUMBER_TOO_SHORT',
        TOO_LONG: 'PHN_NUMBER_TOO_LONG',
        TOO_SHORT: 'PHN_NUMBER_TOO_SHORT',
        UNKNOWN_REGION: 'PHN_UNKNOWN_REGION'
    };

// initialization function that calls injectMeta (provided by metadataInjector)
// sets allRegionCodes
// initializes formatter to first country (necessary to prevent Closure Compiler from removing the code)
function useMeta(bundle) {
    console.log('useMeta called for', bundle['regionCodes']);
    allRegionCodes = bundle['regionCodes']; // quote property names to prevent closure compiler from reducing them
    injectMeta(bundle['countryCodeToRegionCodeMap'], bundle['countryToMetadata']);

    // initialize formatters to the first region code just to prevent closure compiler from removing the code
    setRegion(allRegionCodes[0]); // do this only AFTER injecting metadata
    console.log('useMeta initialized everything to', allRegionCodes[0]);
}

// initialize default region and asYouType formatters
function setRegion(regionCodeParam) {
    if (allRegionCodes.indexOf(regionCodeParam) === -1) {
        throw new Error('Unsupported region: ' + regionCodeParam);
    }

    regionCode = regionCodeParam; // set default region for all function

    // initialize asYouType formatters for default region
    formatter = new i18n.phonenumbers.AsYouTypeFormatter(regionCode);
    statelessFormatter = new i18n.phonenumbers.AsYouTypeFormatter(regionCode);

}

// namespace the stateful AsYouTypeFormatter functions
var asYouType = {
    clear: function clear() {
        console.log('Clearing formatter');
        formatter.clear();
    },

    inputDigit: function inputDigit(digit) {
        console.log('Inputting digit', digit);
        return formatter.inputDigit(digit);
    }
};

// stateless AsYouTypeFormatter (pass full string to it each time)
// designed as stateless to work with ADVANCED_OPTIMIZATIONS
function formatAsTyped(phoneNumber) {

    console.log('Clearing AsYouTypeFormatter for', regionCode);
    statelessFormatter.clear();

    var output;

    // loop over phone number and input digits one by one, then return final output
    if (phoneNumber && typeof phoneNumber === 'string') {
        for (var i = 0; i < phoneNumber.length; i++) {
            output = statelessFormatter.inputDigit(phoneNumber.charAt(i));
            console.log('char:', phoneNumber.charAt(i), 'output:', output);
        }
    }

    return output;
}

/**
 * Original functions from libphonenumber-hammond
 */
function countryCodeToRegionCodeMap() {
    return i18n.phonenumbers.metadata.countryCodeToRegionCodeMap;
}

function getCountryCodeForRegion(regionCodeParam) {
    return phoneUtil.getCountryCodeForRegion(regionCodeParam || regionCode);
}

function getSupportedRegions() {
    return phoneUtil.getSupportedRegions();
}


/**
 *  PHONE ADAPTER FUNCTIONS
 */


/**
 * @param {Object} canonicalPhone
 * @param {Object} options - style : 'national', 'international', 'E164' or 'RFC3699'
 * @return {string} formatted phone number if valid
 * @throws {Error} if style is invalid, or input is undefined/NaN
 */
function formatPhoneNumber(canonicalPhone, options) {
    var phoneNumber;
    try {
        phoneNumber = getPBPhoneFromJSONPhone(canonicalPhone);
    } catch (e) {
        throw e;
    }

    options = options || {};
    var formatType;
    switch (options.style) {
        case styles.NATIONAL:
            formatType = PNF.NATIONAL;
            break;
        case styles.INTERNATIONAL:
            formatType = PNF.INTERNATIONAL;
            break;
        case styles.E164:
            formatType = PNF.E164;
            break;
        case styles.RFC3966:
            formatType = PNF.RFC3966;
            break;
        default:
            throw new Error(errors.INVALID_STYLE);
    }
    return phoneUtil.format(phoneNumber, formatType).toString();
}

/**
 * @param {Object} canonicalPhone
 * @param {string} region i.e. 'US'
 * @return {boolean|Error} true if phone number is valid, Error if phone number is not valid
 * @throws {Error} if conversion to protocol buffer phone format failed (getPBPhoneFromJSONPhone)
 */
function validatePhoneNumber(canonicalPhone, region) {
    var phoneNumber;
    try {
        phoneNumber = getPBPhoneFromJSONPhone(canonicalPhone);
    } catch (e) {
        throw e;
    }
    var validFlag, errorCode = errors.PARSE_ERROR;
    if (region) {
        validFlag = phoneUtil.isValidNumberForRegion(phoneNumber, region);
        errorCode = errors.INVALID_FOR_REGION;
    } else {
        validFlag = phoneUtil.isValidNumber(phoneNumber);
    }
    if (validFlag) {
        return true;
    }

    // Attempt to get the cause of the error
    validFlag = phoneUtil.isPossibleNumberWithReason(phoneNumber);

    if (validFlag === i18n.phonenumbers.PhoneNumberUtil.ValidationResult.TOO_SHORT) {
        errorCode = errors.TOO_SHORT;
    } else if (validFlag === i18n.phonenumbers.PhoneNumberUtil.ValidationResult.TOO_LONG) {
        errorCode = errors.TOO_LONG;
    }

    // Some other error
    return new Error(errorCode);
}


/**
 * HELPER FUNCTIONS
 */

/**
 * @param {Object} canonicalPhone, where countryCode and nationalNumber are required
 * @return {i18n.phonenumbers.PhoneNumber} phoneNumber
 * @throws if countryCode or nationalNumber is undefined or NaN
 * @private
 */
function getPBPhoneFromJSONPhone(canonicalPhone) {
    var phoneNumber = new i18n.phonenumbers.PhoneNumber();
    //make a copy of countryCode/nationalNumber, don't change canonicalPhone
    var countryCode = canonicalPhone['countryCode'],
        nationalNumber = canonicalPhone['nationalNumber'],
        extension = canonicalPhone['extension']; // use string literals to prevent closure compiler from reducing

    // check well-formedness of countryCode
    if (countryCode === undefined) {
        throw new Error(errors.MISSING_COUNTRY_CODE);
    } else {
        if (typeof countryCode === 'string') {
            if (isNaN(Number(countryCode))) {
                throw new Error(errors.INVALID_COUNTRY_CODE);
            }
            countryCode = Number(countryCode);
        }
        phoneNumber.setCountryCode(countryCode);
    }

    // check well-formedness of nationalNumber
    if (nationalNumber === undefined) {
        throw new Error(errors.MISSING_NATIONAL_NUMBER);
    } else {
        if (typeof nationalNumber === 'string') {
            if (isNaN(Number(nationalNumber))) {
                throw new Error(errors.FORMAT_INVALID);
            }
            // setItalianLeadingZero = true if
            // nationalNumber is a string and starts with '0'
            // and leading zero is possible for that country
            phoneNumber.setItalianLeadingZero(nationalNumber.charAt(0) === '0' && phoneUtil.isLeadingZeroPossible(countryCode));

            nationalNumber = Number(nationalNumber);
        }
        phoneNumber.setNationalNumber(nationalNumber);
    }

    // extension should be a string, if it is a number, convert to string
    if (extension !== undefined) {
        if (typeof extension === 'number') {
            phoneNumber.setExtension(extension.toString());
        } else {
            phoneNumber.setExtension(extension);
        }
    }
    return phoneNumber;
}

// original functions
goog.exportSymbol('countryCodeToRegionCodeMap', countryCodeToRegionCodeMap);
goog.exportSymbol('getCountryCodeForRegion', getCountryCodeForRegion);
goog.exportSymbol('getSupportedRegions', getSupportedRegions);

// phone adapter functions
goog.exportSymbol('formatPhoneNumber', formatPhoneNumber);
goog.exportSymbol('validatePhoneNumber', validatePhoneNumber);

// initialization functions
goog.exportSymbol('useMeta', useMeta);
goog.exportSymbol('setRegion', setRegion);

// AsYouTypeFormatter functions
goog.exportSymbol('asYouType.clear', asYouType.clear);
goog.exportSymbol('asYouType.inputDigit', asYouType.inputDigit);
goog.exportSymbol('formatAsTyped', formatAsTyped);

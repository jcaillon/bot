// The exported functions in this module makes a call to Bing Spell Check API that returns spelling corrections.
// For more info, check out the API reference:
// https://dev.cognitive.microsoft.com/docs/services/56e73033cf5ff80c2008c679/operations/56e73036cf5ff81048ee6727
var request = require('request');

var TEXT_CHECK_API_URL = process.env.TEXT_CHECK_URL,
    TEXT_CHECK_API_KEY = process.env.TEXT_CHECK_API_KEY;

/**
 * Gets the sentiment score of a given text
 * @param {string} text The text to analyse
 * @returns {Promise} Promise with corrected text if succeeded, error otherwise.
 */
exports.getSentiment = function (text) {
    return new Promise(
        function (resolve, reject) {
            if (text) {
                var requestData = {
                    url: TEXT_CHECK_API_URL,
                    headers: {
                        "Ocp-Apim-Subscription-Key": TEXT_CHECK_API_KEY,
                        "Content-Type": "application/json"
                    },
                    body: {
                        documents: [ {
                            text: text,
                            id: '1',
                            language: 'fr'
                        }]
                    },
                    json: true
                };

                request.post(requestData, function (error, response, body) {
                    if (error) {
                        reject(error);
                    }
                    else if (response.statusCode != 200) {
                        reject(body);
                    }
                    else {
                        if (response.body.hasOwnProperty('documents')) {
                            resolve(response.body.documents[0].score);
                        } else {
                            resolve(-1);
                        }
                    }
                });
            } else {
                resolve(-1);
            }
        }
    )
}

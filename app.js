var restify = require('restify');
var builder = require('botbuilder');
var luisurl = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/3eabb991-acbb-45c2-981f-6ffea7d077bb?subscription-key=e0eed1d989074717ba571e054e3563c4&timezoneOffset=0&verbose=true&q=';

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
/*var bot = new builder.UniversalBot(connector,    {
 localizerSettings: { 
 defaultLocale: "fr" 
 }
 });
 */
var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Désolé, je n\'ai pas compris votre demande : \'%s\'. tappez \'aide\' pour obtenir une assistance.', session.message.text);
});


var recognizer = new builder.LuisRecognizer(luisurl);
//var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.recognizer(recognizer);
//---------------------------------------------------------
// Dialogs
//---------------------------------------------------------
/*
 bot.dialog('/', [
 // Step 1
 function (session) {
 session.send("Bonjour je suis Camille");
 builder.Prompts.text(session, 'Quel est ton nom?');
 },
 // Step 2
 function (session, results) {
 session.endDialog('Bonjour %s!', results.response);
 }
 ]);
 
 */

bot.dialog('Demande', [
    function (session, args, next) {
        session.send('Analyse de votre demande : \'%s\'', session.message.text);

        // try extracting entities
        var allocation = builder.EntityRecognizer.findEntity(args.intent.entities, 'alloc');
        if (allocation) {
            next({response: allocation.entity});
        } else {
            builder.Prompts.text(session, 'Pour quelle allocation ?');
        }
    },
    function (session, results) {
        var allocation = results.response;

        var message = 'Vous voulez faire une demande pour ';
        message += allocation;
        message += ', avez-vous des questions avant de remplir la demande?';
        session.send(message);

    }
]).triggerAction({
    matches: 'Demande'
});

bot.dialog('Accueil', [
    function (session) {
        session.send("Bonjour je suis Camille");
        builder.Prompts.text(session, 'Quel est ton nom?');
    },
    // Step 2
    function (session, results) {
        session.endDialog('Bonjour %s, que puis-je pour toi?', results.response);
    }
]).triggerAction({
    matches: 'Accueil'
});
 
 bot.dialog('Aide', function (session) {
    session.endDialog('Essaye des demandes du stype \'je veux faire une demande de RSA\' ou \'Mon nouveau numéro de téléphone est xxxxxxx\'');
}).triggerAction({
    matches: 'Aide'
});
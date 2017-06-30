require('dotenv-extended').load();

var restify = require('restify');
var builder = require('botbuilder');
var needle = require('needle');
var url = require('url');
var validUrl = require('valid-url');
var ocrService = require('./ocr-service');
var spellService = require('./spell-service');
var parseOcrDocument = require('./parse-ocr-document');
var textService = require('./text-service');

// global vars
var totalConversationScore = 0;
var totalConversation = 0;
var minscore = 0.5;

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
var bot = new builder.UniversalBot(connector, function (session) {
    if (hasImageAttachment(session)) {
        var stream = getImageStreamFromMessage(session.message);
        ocrService
            .getCaptionFromStream(stream)
            .then(function (caption) { handleSucessOCRResponse(session, caption); })
            .catch(function (error) { handleErrorOCRResponse(session, error); });
    } else {
        var imageUrl = parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text) ? session.message.text : null);
        if (imageUrl) {
            ocrService
                .getCaptionFromUrl(imageUrl)
                .then(function (caption) { handleSucessOCRResponse(session, caption); })
                .catch(function (error) { handleErrorOCRResponse(session, error); });
        } else {                  
            if (session.message.text != 'reset' && session.message.text != 'sentiment') {
                session.send('Désolé, je n\'ai pas compris votre demande : \'%s\'. tapez \'aide\' pour obtenir une assistance.', session.message.text);
            }
        }
    }
});

// Middlewares :
// Spell Check + sentiment analysis
if (process.env.IS_SPELL_CORRECTION_ENABLED === 'true') {
    bot.use({
        botbuilder: function (session, next) {
            if (session.message.text === 'reset') {
                totalConversationScore = 0;
                totalConversation = 0;    
                session.reset();
                session.endDialog("La session a été réinitialisée");
                return;
            }
            if (session.message.text === 'sentiment') {
                console.log ('sentiment écrit');
                var result = (totalConversation == 0 ? 0 : Math.round(totalConversationScore / totalConversation * 100));
                console.log (result);
                session.send("Le score sentiment est actuellement de " + result + '%').endDialog();
                return;
            }
            spellService
                .getCorrectedText(session.message.text)
                .then(function (text) {
                    session.message.text = text;
                    next();
                })
                .catch(function (error) {
                    console.error(error);
                    next();
                });
            textService
                .getSentiment(session.message.text)
                .then(function (score) {
                    if (score >= 0) {
                        totalConversationScore += score;
                        totalConversation++;
                        console.log("Score de la phrase " + score + "%");
                        if (score < 0.3) {
                            session.send('Veuillez rester poli s\'il vous plait!').endDialog();
                        }
                        console.log('Current conversation score : ' + Math.round(totalConversationScore / totalConversation * 100) + '%');
                    }
                })
                .catch(function (error) {
                    console.error(error);
                });
        }
    });
}

var recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
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

//=========================================================
// Bots Events
//=========================================================

//Sends greeting message when the bot is first added to a conversation
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                var reply = new builder.Message()
                    .address(message.address)
                    .text('Bonjour, je suis Camille l\'assistante du Caf.fr');
                bot.send(reply);
            }
        });
    }
});


var nom;
var logement;

bot.dialog('intentDemande', [
    function (session, args, next) {
        //session.send('Analyse de votre demande : \'%s\'', session.message.text);
        if(args.intent.score < minscore) {  session.endDialog('Je peux vous assister uniquement sur des demandes liées aux Allocations Familiales.'); return; }
        // try extracting entities
        var domaine = builder.EntityRecognizer.findEntity(args.intent.entities, 'DomaineMetier');
        
        if (domaine) {
            
            next({response: domaine});
        } else {
            builder.Prompts.text(session, 'Pour quelle domaine ?');
        }
    },
    function (session, results) {
        domaine = results.response.resolution.values[0];
        if(domaine==='Logement'){
        var message = 'Je peux vous proposer plusieurs types d\'allocation logement. choisissez celle qui correspond à votre situation.';
        session.send(message);
        
         var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .subtitle("ALE")
            .title("Allocation logement étudiant")
            .text('L\’allocation logement étudiant est destinée à toute personne : locataire d\'un logement neuf ou ancien, accédant à la propriété ou déjà propriétaire')
            .images([builder.CardImage.create(session, 'https://storagecamille.blob.core.windows.net/miniatures/etudiant2.jpg')])

            .buttons([
                builder.CardAction.imBack(session, "je choisis l'allocation ALE", "Choisir")
            ]),
        new builder.HeroCard(session)
            .subtitle("AL")
            .title("Allocation logement")
            .text('L\’allocation logement est destinée à toute personne : locataire d\'un logement neuf ou ancien, accédant à la propriété ou déjà propriétaire')
            .images([builder.CardImage.create(session, 'https://storagecamille.blob.core.windows.net/miniatures/famille2.jpg')])

            .buttons([
                builder.CardAction.imBack(session, "je choisis l'allocation AL", "Choisir")
            ]),
        new builder.HeroCard(session)
            .subtitle("APL")
            .title("Allocation personnalisée au logement")
            .text('L\’aide personnalisée au logement est destinée à toute personne : locataire d\'un logement neuf ou ancien, accédant à la propriété ou déjà propriétaire')
            .images([builder.CardImage.create(session, 'https://storagecamille.blob.core.windows.net/miniatures/hipster2.jpg')])

            .buttons([
                builder.CardAction.imBack(session, "je choisis l'allocation APL", "Choisir")
            ])
    ]);
    session.endDialog(msg);
    }else {
        session.endDialog('Je ne traite pas encore les demandes associées au domaine %s, mais j\'apprend vite!',domaine);
    }
    }
]).triggerAction({
    matches: 'intentDemande'
});

var flg;

bot.dialog('intentChoix', [
    function (session, args, next) {
        //if(args.intent.score < minscore) {  session.endDialog('Je peux vous assister uniquement sur des demandes liées aux Allocations Familiales.'); return; }


        // try extracting entities

        var presta = builder.EntityRecognizer.findEntity(args.intent.entities, 'PrestationsLogement');
        
        if (presta) {            
            next({response: presta});
        } else {
            builder.Prompts.text(session, 'Pour quelle prestation ?');
        }
    },
    function (session, results) {
        flg='ALE';
        presta = results.response.resolution.values[0];
        session.send(presta);
        if(presta==='ALE'){
        var message = 'Voici les conditions pour obtenir l\'ALE.<br><ul><li>Avoir le bail à son nom</li><li>Fournir une quittance de loyer</li></ul>';
         session.send(message);
       var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .text("Souhaitez-vous pré-remplir votre demande?")
            .buttons([
                builder.CardAction.imBack(session, "Oui", "Oui"),
                builder.CardAction.imBack(session, "Non", "Non")
            ])
    ]);
    session.send(msg);
    
    } else if (presta==='AL'){
        var message = 'Voici les conditions pour obtenir l\AL.';
    } else {
        var message = 'Voici les conditions pour obtenir l\APL.';
    }
    //session.endDialog(message);
   
    }
]).triggerAction({
    matches: 'intentChoix'
});


bot.dialog('intentOui', [
    function (session, results) {
        if(flg==='ENR')
                {
                 session.endDialog('Vos informations sont enregistrées, avez-vous votre bail?');
                  
                }
        if(flg==='DOC'){
            flg='ENR';
        session.endDialog('Très bien %s, pouvez-vous prendre une photo avec votre smartphone ou joindre le scan de votre déclaration?',prenom);  
    } else if(flg==='ALE')    {
        flg='DOC';
    session.send('Pouvez-vous nous communiquer votre quittance de loyer?');
    }        }
]).triggerAction({
    matches: 'intentOui'
});


bot.dialog('intentNon', [
    function (session, results) {
        if(flg==='FIN'){
            flg='';
            session.send('Au revoir et à bientot sur le www.caf.fr');     
            session.endDialog('Camille remercie tous les organisateurs et participants de ce super évenement.');                 
        }
        if(flg==='ENR')
                {
                 session.endDialog('Pensez à nous envoyer votre document pour compléter votre dossier, avez-vous une autre question?');
                 flg='FIN'; 
                }
        if(flg==='DOC'){
            flg='FIN';
        session.endDialog('Pensez à nous communiquer votre quittance de loyer pour compléter votre dossier, avez-vous une autre question?');  
    } else if(flg==='ALE')    {
        flg='FIN';
   session.endDialog('Avez-vous une autre question?');
    }        }
]).triggerAction({
    matches: 'intentNon'
});

bot.dialog('None', [
    function (session, results) {
   session.endDialog('Je peux vous assister uniquement sur des demandes liées aux Allocations Familiale.');
    }        
]).triggerAction({
    matches: 'None'
});


var prenom='Luc';
var montant;
var numalloc;

bot.dialog('intentBonjour', 
    function (session,args) {
    if(args.intent.score < minscore-0.2) {  session.endDialog('Je peux vous assister uniquement sur des demandes liées aux Allocations Familiales.'); return; }
        session.endDialog('Bonjour %s, je suis Camille. Que puis-je pour vous ?', prenom);
    }
).triggerAction({
    matches: 'intentBonjour'
});
 
 
 
 
 
 
 var ouinon = {
    oui: 'Oui',
    non: 'Non'
};

 
 bot.dialog('intentAide', 
 
function (session) {
    /*
     builder.Prompts.text(session, 'Pouvez-vous me fournir l\'image du docuemnt?');
    if (hasImageAttachment(session)) {
        var stream = getImageStreamFromMessage(session.message);
        ocrService
            .getCaptionFromStream(stream)
            .then(function (caption) { handleSuccessResponse(session, caption); })
            .catch(function (error) { handleErrorResponse(session, error); });
    } else {
        var imageUrl = parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text) ? session.message.text : null);
        if (imageUrl) {
            ocrService
                .getCaptionFromUrl(imageUrl)
                .then(function (caption) { handleSuccessResponse(session, caption); })
                .catch(function (error) { handleErrorResponse(session, error); });
        } else {
            session.send('Did you upload an image? I\'m more of a visual person. Try sending me an image or an image URL');
        }
}
    */
     
/*
     builder.Prompts.choice(session,'Souhaitez-vous pré remplir votre formulaire?',
     [ouinon.oui,ouinon.non],
     {maxRetries: 3,
         retryPrompt: 'Option non valide'});
     
} ,
    function (session, results) {
         if (!results.response) {
            // exhausted attemps and no selection, start over
            session.send('Trop d\'essais');
            return session.endDialog();
        }

        // on error, start over
        session.on('error', function (err) {
            session.send('Erreur avec le message: %s', err.message);
            session.endDialog();
        });

        // continue on proper dialog
        var selection = results.response.entity;
        switch (selection) {
            case '1':
                return session.endDialog('reponse 1');
            case '2':
                return session.endDialog('reponse 2');
        }
        
        if(!results.response){
            session.send('Trop d\'erreur');
            return session.endDialog();
        }
        session.endDialog('réponse : '+results.reponse.entity);

    }
    */
   
     /* caroussel
      var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .title("Classic White T-Shirt")
            .subtitle("100% Soft and Luxurious Cotton")
            .text("Price is $25 and carried in sizes (S, M, L, and XL)")
            .images([builder.CardImage.create(session, 'https://winblogs.azureedge.net/win/2015/07/Windows_Insider_Ninjacat_Unicorn-1024x768-Desktop.png')])
            .buttons([
                builder.CardAction.imBack(session, "buy classic white t-shirt", "Buy")
            ]),
        new builder.HeroCard(session)
            .title("Classic Gray T-Shirt")
            .subtitle("100% Soft and Luxurious Cotton")
            .text("Price is $25 and carried in sizes (S, M, L, and XL)")
            .images([builder.CardImage.create(session, 'http://news.thewindowsclubco.netdna-cdn.com/wp-content/uploads/2015/03/Ninja-Cat-Unicorn-sticker.png')])
            .buttons([
                builder.CardAction.imBack(session, "buy classic gray t-shirt", "Buy")
            ])
    ]);
    session.send(msg);
    */
   /*
   var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .text("Confirmez-vous?")
            .buttons([
                builder.CardAction.imBack(session, "Oui", "Oui"),
                builder.CardAction.imBack(session, "Non", "Non")
            ])
    ]);
    session.send(msg);
} ,
    function (session, results) {
         if (!results.response) {
            // exhausted attemps and no selection, start over
            session.send('Trop d\'essais');
            return session.endDialog();
        }

        // on error, start over
        session.on('error', function (err) {
            session.send('Erreur avec le message: %s', err.message);
            session.endDialog();
        });

        // continue on proper dialog
        var selection = results.response;
        switch (selection) {
            case '1':
                return session.endDialog('reponse 1');
            case '2':
                return session.endDialog('reponse 2');
        }
        
        if(!results.response){
            session.send('Trop d\'erreur');
            return session.endDialog();
        }
        session.endDialog('réponse : '+results.reponse.entity);

    
 */  
    session.endDialog(nom+ 'Essaye des demandes du stype \'je veux faire une demande de RSA\' ou \'Mon nouveau numéro de téléphone est xxxxxxx\'');
    }).triggerAction({
    matches: 'intentAide'
});


//=========================================================
// Utilities
//=========================================================
function hasImageAttachment(session) {
    return session.message.attachments.length > 0 &&
        session.message.attachments[0].contentType.indexOf('image') !== -1;
}

function getImageStreamFromMessage(message) {
    var headers = {};
    var attachment = message.attachments[0];
    if (checkRequiresToken(message)) {
        // The Skype attachment URLs are secured by JwtToken,
        // you should set the JwtToken of your bot as the authorization header for the GET request your bot initiates to fetch the image.
        // https://github.com/Microsoft/BotBuilder/issues/662
        connector.getAccessToken(function (error, token) {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, { headers: headers });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    return needle.get(attachment.contentUrl, { headers: headers });
}

function checkRequiresToken(message) {
    return message.source === 'skype' || message.source === 'msteams';
}

/**
 * Gets the href value in an anchor element.
 * Skype transforms raw urls to html. Here we extract the href value from the url
 * @param {string} input Anchor Tag
 * @return {string} Url matched or null
 */
function parseAnchorTag(input) {
    var match = input.match('^<a href=\"([^\"]*)\">[^<]*</a>$');
    if (match && match[1]) {
        return match[1];
    }

    return null;
}

//=========================================================
// Response Handling
//=========================================================
function handleSucessOCRResponse(session, ocrObj) {
    /*if (process.env.DEBUG)
        session.send('OCR response JSON : ' + JSON.stringify(ocrObj));
        */
    var allocataire = parseOcrDocument.getAllocataire(ocrObj, [{"nom": "nom"}, {"prenom": "prenom"}, {"total": "montant"}]);

    if (allocataire.montant.length > 0) {
        session.send(' Nous avons collecté les informations suivantes<br><ul><li>Nom, prénom : %s</li><li>Montant : %s</li></ul>', allocataire.nom + ' ' + allocataire.prenom, allocataire.montant);
        session.endDialog('Voulez-vous que l\'on conserve ces informations pour votre demande?');
    }
}

function handleErrorOCRResponse(session, error) {
    var clientErrorMessage = 'Oops! Quelque chose c\'est mal passée. Merci de recommencer plus tard.';
    if (error.message && error.message.indexOf('Access denied') > -1) {
        clientErrorMessage += "\n" + error.message;
    }
    console.error(error);
    session.send(clientErrorMessage);
}

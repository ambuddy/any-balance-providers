/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Charset':'windows-1251,utf-8;q=0.7,*;q=0.3',
	'Accept-Language':'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
	'Connection':'keep-alive',
	'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.80 Safari/537.36'
};

var nodeUrl = ''; // Подставляется при авторизации, обычно имеет вид https://node1.online.sberbank.ru/

function getLoggedInHtml(){
    var nurl = (nodeUrl || 'https://node1.online.sberbank.ru');
    var html = AnyBalance.requestGet(nurl + '/PhizIC/private/userprofile/userSettings.do', g_headers);
    if(/accountSecurity.do/i.test(html)){
        nodeUrl = nurl;
        return html;
    }
}

function login(prefs) {
	var baseurl = "https://online.sberbank.ru/CSAFront/login.do";
	AnyBalance.setDefaultCharset('utf-8');
	
	checkEmpty(prefs.login, "Пожалуйста, укажите логин для входа в Сбербанк-Онлайн!");
	checkEmpty(prefs.password, "Пожалуйста, укажите пароль для входа в Сбербанк-Онлайн!");

	var html = getLoggedInHtml();
    if(html){
        AnyBalance.trace("Уже залогинены, используем текущую сессию");
        return html;
    }

	//Сбер разрешает русские логины и кодирует их почему-то в 1251, хотя в контент-тайп передаёт utf-8.
	AnyBalance.setDefaultCharset('windows-1251');
	html = AnyBalance.requestPost(baseurl, {
		'field(login)': prefs.login,
		'field(password)': prefs.password,
		operation: 'button.begin'
	}, addHeaders({Referer: baseurl, 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://online.sberbank.ru'}));
	AnyBalance.setDefaultCharset('utf-8');
	
	var error = getParam(html, null, null, /<h1[^>]*>О временной недоступности услуги[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i, replaceTagsAndSpaces);
	if (error)
		throw new AnyBalance.Error(error);
	
	error = getParam(html, null, null, /в связи с ошибкой в работе системы[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i, replaceTagsAndSpaces);
	if (error)
		throw new AnyBalance.Error(error);
	
	if (/\$\$errorFlag/i.test(html)) {
		var error = getParam(html, null, null, /([\s\S]*)/, [replaceTagsAndSpaces, /^:/, '']);
		throw new AnyBalance.Error(error, null, /Ошибка идентификации/i.test(error));
	}
	
	var page = getParam(html, null, null, /value\s*=\s*["'](https:[^'"]*?AuthToken=[^'"]*)/i);
	if (!page) {
		AnyBalance.trace(html);
		throw new AnyBalance.Error("Не удаётся найти ссылку на информацию. Пожалуйста, обратитесь к разработчикам для исправления ситуации.");
	}
	
	AnyBalance.trace("About to authorize: " + page);	
	
	if (/online.sberbank.ru\/PhizIC/.test(page)) {
		html = doNewAccount(page);
	} else if (/Off_Service/i.test(page))
		throw new AnyBalance.Error("В настоящее время услуга Сбербанк ОнЛ@йн временно недоступна по техническим причинам. Сбербанк приносит свои извинения за доставленные неудобства.");
	else {
        AnyBalance.trace(html);
        throw new AnyBalance.Error("К сожалению, ваш вариант Сбербанка-онлайн пока не поддерживается. Пожалуйста, обратитесь к разработчикам для исправления ситуации.");
    }

    __setLoginSuccessful();
	
	return html;
}

function doNewAccount(page) {
	var html = AnyBalance.requestGet(page, addHeaders({Referer: baseurl}));

	if(!html){
		AnyBalance.trace('Почему-то получили пустую страницу... Попробуем ещё раз');
		html = AnyBalance.requestGet(page, addHeaders({Referer: baseurl}));
	}

	if (/StartMobileBankRegistrationForm/i.test(html)) {
		//Сбербанк хочет, чтобы вы приняли решение о подключении мобильного банка. Откладываем решение.
		var pageToken = getParamByName(html, 'PAGE_TOKEN');
		checkEmpty(pageToken, 'Попытались отказаться от подключения мобильного банка, но не удалось найти PAGE_TOKEN!', true);
		
		html = AnyBalance.requestPost('https://online.sberbank.ru/PhizIC/login/register-mobilebank/start.do', {
			PAGE_TOKEN: pageToken,
			operation: 'skip'
		}, addHeaders({Referer: baseurl}));
	}

	// А ну другой кейс, пользователь сменил идентификатор на логин
	if(/Ранее вы[^<]*уже создали свой собственный логин для входа/i.test(html)) {
		checkEmpty(null, getParam(html, null, null, /Ранее вы[^<]*уже создали свой собственный логин для входа[^<]*/i, replaceTagsAndSpaces));
	}
	
	var baseurl = getParam(page, null, null, /^(https?:\/\/.*?)\//i);
	nodeUrl = baseurl;
	if (/PhizIC/.test(html)) {
		AnyBalance.trace('Entering physic account...: ' + baseurl);
		if (/confirmTitle/.test(html)) {
			var origHtml = html;

		    //проверяем сначала тип подтверждения и переключаем его на смс, если это чек
			var active = getElement(html, /<div[^>]+clickConfirm[^>]+buttonGreen[^>]*>/i) || '';
			if(/confirmSMS/i.test(active)){
				AnyBalance.trace('Запрошен смс-пароль...');
			}else if(/confirmCard/i.test(active)){
				AnyBalance.trace('Запрошен пароль с чека. Это неудобно, запрашиваем пароль по смс.');
				html = AnyBalance.requestPost(baseurl + '/PhizIC/async/confirm.do', {
					'PAGE_TOKEN': getParamByName(origHtml, 'PAGE_TOKEN'),
					'operation': 'button.confirmSMS'
				}, addHeaders({Referer: baseurl, 'X-Requested-With': 'XMLHttpRequest'}));
			}else{
				AnyBalance.trace('Неизвестное подтверждение: ' + active + '. Надеемся, это смс.');
			}

			var pass = AnyBalance.retrieveCode('Для входа в интернет банк, пожалуйста, введите одноразовый пароль, который выслан вам по СМС.\n\nЕсли вы не хотите постоянно вводить СМС-пароли при входе, вы можете отменить их в настройках вашего Сбербанк-онлайн. Это безопасно - для совершения денежных операций требование одноразового пароля всё равно останется', null, {time: 300000});
			
			html = AnyBalance.requestPost(baseurl + '/PhizIC/async/confirm.do', {
				'receiptNo': '',
				'passwordsLeft': '',
				'passwordNo': '',
				'SID': '',
				'$$confirmSmsPassword': pass,
				'PAGE_TOKEN': getParamByName(origHtml, 'PAGE_TOKEN'),
				'operation': 'button.confirm'
			}, addHeaders({Referer: baseurl, 'X-Requested-With': 'XMLHttpRequest'}));
			
			
			// throw new AnyBalance.Error("Ваш личный кабинет требует одноразовых паролей для входа. Пожалуйста, отмените в настройках кабинета требование одноразовых паролей при входе. Это безопасно: для совершения денежных операций требование одноразового пароля всё равно останется.");
		}
		if (/internetSecurity/.test(html)) {
			AnyBalance.trace('Требуется принять соглашение о безопасности... Принимаем...');
			
			html = AnyBalance.requestPost(baseurl + '/PhizIC/internetSecurity.do', {
				'field(selectAgreed)': 'on',
				'PAGE_TOKEN': getParamByName(html, 'PAGE_TOKEN'),
				'operation': 'button.confirm'
			}, addHeaders({Referer: baseurl, 'X-Requested-With': 'XMLHttpRequest'}));
		}
		
		if (/Откроется справочник регионов, в котором щелкните по названию выбранного региона/.test(html)) {
			//Тупой сбер предлагает обязательно выбрать регион оплаты. Вот навязчивость...
			//Ну просто выберем все регионы
			html = AnyBalance.requestPost(baseurl + '/PhizIC/region.do', {
				id: -1,
				operation: 'button.save'
			}, addHeaders({Referer: baseurl, 'X-Requested-With': 'XMLHttpRequest'}));
		}

		if(!/accountSecurity.do/i.test(html)){
			var error = getElement(html, /<div[^>]+warningMessages[^>]*>/i, [replaceTagsAndSpaces, /Получите новый пароль, нажав.*/i, '']);
			if(error)
				throw new AnyBalance.Error(error);
		}

		if(!/accountSecurity.do/i.test(html)){
			var html1 = getLoggedInHtml();

			if(!/accountSecurity.do/i.test(html1)){
				AnyBalance.trace(html);
				throw new AnyBalance.Error('Не удалось зайти в Cбербанк-онлайн. Сайт изменен?');
			}

			html = html1;
		}

	} else {
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Ваш тип личного кабинета не поддерживается. Свяжитесь, пожалуйста, с разработчиками.');
	}
	
	return html;
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Обработка счетов
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processAccounts(html, result) {
    if(!AnyBalance.isAvailable('accounts'))
        return;

	html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/accounts/list.do', g_headers);
	var pageToken = getParamByName(html, 'PAGE_TOKEN');
	
	var accounts = getElements(html, /<div[^>]+class="productCover[^"]*Product[^>]*">/ig, g_headers);
	AnyBalance.trace('Найдено счетов: ' + accounts.length);
	result.accounts = [];
	
	for(var i=0; i < accounts.length; ++i){
		var acc = accounts[i];
		var _id = getParam(acc, null, null, /<div[^>]+id="account_(\d+)/i);
		var name = getElement(acc, /<div[^>]+productName[^>]*>/i, replaceTagsAndSpaces);
		var num = getParam(acc, null, null, /<[^>]*class="productNumber\b[^"]*">([^<]+)/i, replaceTagsAndSpaces), info;
		if(num){
			//Попытаемся извлечь номер счета
			num = getParam(acc, null, null, /№([^,]*)/i);
		}else{
			AnyBalance.trace('Не удаётся найти номер счета ' + name + '! Пробуем получить его из расширенной информации.');
			info = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/accounts/bankDetails.do?id=' + _id, g_headers);
			num = getParam(info, null, null, /Номер счета:[\s\S]*?<div[^>]+detailsValue[^>]*>([\s\S]*?)<\/div>/i, replaceTagsAndSpaces);
			AnyBalance.trace('Получен номер: ' + num);
		}
		
		var c = {__id: _id, __name: name, num: num};
		
		if(__shouldProcess('accounts', c)){
			processAccount(accounts[i], c, pageToken);
		}
		
		result.accounts.push(c);
	}
}

function parseAllow(str){
	return /разрешено/i.test(str);
}

function processAccount(html, result, pageToken){
    AnyBalance.trace('Обработка счета ' + result.__name);

    var isTarget = /thermometertargetTemplate/i.test(html);

    if(!isTarget){
		getParam(html, result, 'accounts.balance', /overallAmount\b[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'accounts.rate', /descriptionRight[^>]*>\s*([\d.,]+%)/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, ['accounts.currency', 'accounts.balance'], /overallAmount\b[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseCurrency);
		getParam(html, result, 'accounts.till', /<[^>]*class="(?:product|account)Number\b[^"]*">[^<]+,\s+действует (?:до|по)([^<]+)/i, replaceTagsAndSpaces, parseDateWord);
	}else{
		//Целевой
		getParam(html, result, 'accounts.balance', /dribbleCenter\b[^>]*>([\s\S]*?)<\/div>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'accounts.rate', /ставка:\s*([\d.,]+%)/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, ['accounts.currency', 'accounts.balance'], /dribbleCenter\b[^>]*>([\s\S]*?)<\/div>/i, replaceTagsAndSpaces, parseCurrency);
		getParam(html, result, 'accounts.till', /Дата покупки\s*<span[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseDate);
	}

	if(AnyBalance.isAvailable('accounts.num', 'accounts.period', 'accounts.balance_min', 'accounts.pct_conditions', 'accounts.status', 'accounts.prolong', 'accounts.withdraw', 'accounts.topup')){
		var info = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/accounts/info.do?id=' + result.__id, g_headers);
	    
		getParam(info, result, 'accounts.num', /Номер счета[^<]*:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
		getParam(info, result, 'accounts.period', /Срок вклада:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
		getParam(info, result, 'accounts.balance_min', /Сумма неснижаемого остатка:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
		getParam(info, result, 'accounts.pct_conditions', /Порядок уплаты процентов:[\s\S]*?<td[^>]*>([\s\S]*?)(?:<\/td>|<script)/i, replaceTagsAndSpaces);
		getParam(info, result, 'accounts.status', /Текущее состояние:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
		//Пролонгация:	не осуществляется|осуществляется
		getParam(info, result, 'accounts.prolong', /Пролонгация:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces); 
		getParam(info, result, 'accounts.withdraw', /Списание:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseAllow);
		getParam(info, result, 'accounts.topup', /Зачисление:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseAllow);
	}
	
	if(AnyBalance.isAvailable('accounts.transactions'))
		processAccountTransactions(pageToken, result);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Обработка карт
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processCards(html, result) {
	if(!AnyBalance.isAvailable('cards'))
		return;

	html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/cards/list.do');
	var cards = getElements(html, /<div[^>]+class="productCover[^"]*(?:activeProduct|errorProduct)[^>]*">/ig);
	AnyBalance.trace('Найдено карт: ' + cards.length);
	result.cards = [];
	
	for(var i=0; i < cards.length; ++i){
		var _id = getParam(cards[i], null, null, /<div[^>]+id="card_(\d+)/i);
		var title = getParam(cards[i], null, null, /<[^>]*class="accountNumber\b[^"]*">([^<]+)/i, replaceTagsAndSpaces);
		
		var c = {__id: _id, __name: title};
		
		if(__shouldProcess('cards', c)) {
			processCard(cards[i], c);
		}
		
		result.cards.push(c);
	}
}

function processCard(html, result){
	var _id = result.__id;
    AnyBalance.trace('Обработка карты ' + result.__name);
	
	getParam(html, result, 'cards.balance', /overallAmount\b[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseBalance);
	getParam(html, result, ['cards.currency', 'cards.balance', 'cards.cash', 'cards.electrocash', 'cards.debt', 'cards.maxlimit'], /overallAmount\b[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseCurrency);
	getParam(html, result, 'cards.cardNumber', /<[^>]*class="accountNumber\b[^"]*">([^<,]+)/i, replaceTagsAndSpaces);
	getParam(html, result, 'cards.till', /<[^>]*class="accountNumber\b[^"]*">[^<]+,\s+действует (?:до|по)([^<]+)/i, replaceTagsAndSpaces, parseDateWord);
    getParam(html, result, 'cards.accnum', /<[^>]*class="accountNumber\b[^"]*">([^<,]+)/i, replaceTagsAndSpaces);
    getParam(html, result, 'cards.status', /<[^>]*class="detailStatus\b[^"]*">([^<]+)/i, replaceTagsAndSpaces);
    getParam(html, result, 'cards.is_blocked', /Blocked.jpg/i, null, function(str) { return !!str});

	if (AnyBalance.isAvailable('cards.userName', 'cards.own', 'cards.cash', 'cards.electrocash', 'cards.minpay', 'cards.minpaydate', 'cards.maxlimit', 'cards.debt', 'cards.debt_date')) {
		html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/cards/detail.do?id=' + _id);
		getParam(html, result, 'cards.userName', /Держатель карты:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/, replaceTagsAndSpaces, capitalFirstLetters);
        getParam(html, result, 'cards.accnum', /Номер счета карты:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/, replaceTagsAndSpaces);
		getParam(html, result, 'cards.cash', /Для снятия наличных:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'cards.electrocash', /для покупок:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'cards.minpay', /Обязательный платеж[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'cards.minpaydate', /Дата платежа:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/, replaceTagsAndSpaces, parseDateWord);
		getParam(html, result, 'cards.maxlimit', /Кредитный лимит[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
        getParam(html, result, 'cards.own', /Собственные средства:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);

		getParam(html, result, 'cards.debt', /Общая задолженность[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'cards.debt_date', /Дата формирования(?:\s|<[^>]*>)+отчета:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);
	}
	// // Нужно только для старого провайдера
	// if (AnyBalance.isAvailable('cards.lastPurchSum', 'cards.lastPurchPlace', 'cards.lastPurchDate')) {
		// html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/cards/info.do?id=' + _id);
		// var tr = getParam(html, null, null, /<tr[^>]*class="ListLine0"[^>]*>([\S\s]*?)<\/tr>/i);
		// if (tr) {
			// getParam(tr, result, 'cards.lastPurchDate', /(?:[\s\S]*?<td[^>]*>){2}([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseSmallDate);
			// getParam(tr, result, 'cards.lastPurchSum', /(?:[\s\S]*?<td[^>]*>){3}([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
			// getParam(tr, result, 'cards.lastPurchPlace', /(?:[\s\S]*?<td[^>]*>){1}([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
		// } else {
			// AnyBalance.trace('Не удалось найти последнюю операцию.');
		// }
	// }
	
	if(AnyBalance.isAvailable('cards.transactions10'))
		processCardLast10Transactions(result);
	if(AnyBalance.isAvailable('cards.transactions'))
		processCardTransactions(result);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Обработка кредитов
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processLoans(html, result) {
	if(!AnyBalance.isAvailable('loans'))
		return;

	html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/loans/list.do');
	var loans = getElements(html, /<div[^>]+class="productCover[^"]*activeProduct[^>]*">/ig);
	AnyBalance.trace('Найдено кредитов: ' + loans.length);
	result.loans = [];
	
	for(var i=0; i < loans.length; ++i){
		var _id = getParam(loans[i], null, null, /id=(\d+)/i);
		var title = getParam(loans[i], null, null, /<span[^>]*title="([^"]+)/i, replaceTagsAndSpaces);
		
		html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/loans/detail.do?id=' + _id);
		var acc_num = getParam(html, null, null, /Номер ссудного счета:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces);

		var c = {__id: _id, num: acc_num, __name: title};
		
		if(__shouldProcess('loans', c)) {
			processLoan(html, c);
		}
		result.loans.push(c);
	}
}

function processLoan(html, result){
	var _id = result.__id;
    AnyBalance.trace('Обработка кредита ' + result.__name);
	
	getParam(html, result, 'loans.balance', /Осталось оплатить:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
	getParam(html, result, ['loans.currency', 'loans.balance', 'loans.loan_ammount', 'loans.minpay'], /Осталось оплатить:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseCurrency);
	getParam(html, result, 'loans.minpaydate', /Внести до:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);
	getParam(html, result, 'loans.minpay', /<span[^>]*detailAmount[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseBalance);
	getParam(html, result, 'loans.loan_ammount', /Сумма кредита:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
	getParam(html, result, 'loans.userName', /ФИО заемщика:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, capitalFirstLetters);
	getParam(html, result, 'loans.agreement', /Номер договора:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces);
	getParam(html, result, 'loans.return_type', /Способ погашения:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces);
	getParam(html, result, 'loans.date_start', /Кредит открыт:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);
	getParam(html, result, 'loans.till', /Дата закрытия кредита:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);
	getParam(html, result, 'loans.place', /Место оформления:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces);
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Обработка металлических счетов
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processMetalAccounts(html, result) {
    if(!AnyBalance.isAvailable('accounts_met'))
        return;

	html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/ima/list.do');
	var accounts = getElements(html, /<div[^>]+class="productCover[^"]*activeProduct[^>]*">/ig);
	AnyBalance.trace('Найдено мет. счетов: ' + accounts.length);
	result.accounts_met = [];
	
	for(var i=0; i < accounts.length; ++i){
		var _id = getParam(accounts[i], null, null, /id=(\d+)/i);
		var title = getParam(accounts[i], null, null, /<span[^>]*title="([^"]+)/i, replaceTagsAndSpaces);
		// Заменим ID на номер счета, чтобы выполнять поиск по счетам
		var acc_num = getParam(html, null, null, /"productNumberBlock"(?:[^>]*>){2}\s*([^<]+)/i, [/\D/g, '']);

		var c = {__id: _id, num: acc_num, __name: title};
		
		if(__shouldProcess('accounts_met', c)) {
			processMetalAccount(html, c);
		}
		result.accounts_met.push(c);
	}
}

function processMetalAccount(html, result){
    var _id = result.__id;
    AnyBalance.trace('Обработка металлического счета ' + result.__name);
	
	getParam(html, result, 'accounts_met.weight', /"overallAmount"([^>]*>){2}/i, replaceTagsAndSpaces, parseBalance);
	getParam('г.', result, ['accounts_met.weight_units', 'accounts_met.weight']);
    getParam(html, result, 'accounts_met.balance', /По курсу покупки Банка:([^]*?)<\/div>/i, replaceTagsAndSpaces, parseBalance);
    getParam(html, result, 'accounts_met.currency', /По курсу покупки Банка:([^]*?)<\/div>/i, replaceTagsAndSpaces, parseCurrency);
    getParam(html, result, 'accounts_met.date_start', /Открыт:[^]*?<td[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);

    if(AnyBalance.isAvailable('accounts_met.transactions')){
        processMetalAccountTransactions(html, result);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Профиль пользователя
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processProfile(html, result) {
	if(!AnyBalance.isAvailable('info'))
		return;

	AnyBalance.trace('Разбираем профиль...');

	var info = result.info = {};
	
	html = AnyBalance.requestGet(nodeUrl + '/PhizIC/private/userprofile/userSettings.do');
	
	getParam(html, info, 'info.fio', /<span[^>]+"userFIO"[^>]*>([^]*?)<\/span>/i, replaceTagsAndSpaces, capitalFirstLetters);
	getParam(html, info, 'info.hphone', /Домашний телефон:[^]*?<span[^>]+"phoneNumber"[^>]*>([^]*?)<\/span>/i, replaceTagsAndSpaces);
    getParam(html, info, 'info.phone', /Мобильный телефон:[^]*?<span[^>]+"phoneNumber"[^>]*>([^]*?)<\/span>/i, replaceTagsAndSpaces);
	getParam(html, info, 'info.email', /<span[^>]+userEmail[^>]*>([^]*?)<\/span>/i, replaceTagsAndSpaces);
	getParam(html, info, 'info.passport', /Паспорт гражданина РФ[^]*?<td[^>]+class="docNumber"[^>]*>([^]*?)<\/td>/i, replaceTagsAndSpaces);
    getParam(html, info, 'info.snils', /Страховое свидетельство[^]*?<div[^>]+class="documentNumber"[^>]*>([^]*?)<\/div>/i, replaceTagsAndSpaces);
    getParam(html, info, 'info.inn', /<div[^>]*documentTitle[^>]*>\s*ИНН[^]*?<div[^>]+class="documentNumber"[^>]*>([^]*?)<\/div>/i, replaceTagsAndSpaces);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Всякие вспомогательные функции
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function sortObject(objArray, sortField) {
	return objArray.sort(function sortFunction(a, b) {
		if(a[sortField] > b[sortField])
			return -1;
		
		if(a[sortField] < b[sortField])
			return 1;
		
		return 0
	});
}

function getFormattedDate(yearCorr) {
	var dt = new Date();
	
	var day = (dt.getDate() < 10 ? '0' + dt.getDate() : dt.getDate());
	var month = ((dt.getMonth()+1) < 10 ? '0' + (dt.getMonth()+1) : dt.getMonth()+1);
	var year = isset(yearCorr) ? dt.getFullYear() - yearCorr : dt.getFullYear();
	
	return day + '/' + month + '/' + year;
}

function getParamByName(html, name) {
    return getParam(html, null, null, new RegExp('name=["\']' + name + '["\'][^>]*value=["\']([^"\']+)"', 'i'));
}

function processRates(html, result) {
	AnyBalance.trace('Fetching rates...');
	
	getParam(html, result, 'eurPurch', /"currencyRateName"[^>]*>EUR(?:[^>]*>){2}([^<]*)/i, null, parseBalance);
	getParam(html, result, 'eurSell', /"currencyRateName"[^>]*>EUR(?:[^>]*>){5}([^<]*)/i, null, parseBalance);
	getParam(html, result, 'usdPurch', /"currencyRateName"[^>]*>USD(?:[^>]*>){2}([^<]*)/i, null, parseBalance);
	getParam(html, result, 'usdSell', /"currencyRateName"[^>]*>USD(?:[^>]*>){5}([^<]*)/i, null, parseBalance);
}

function fetchNewThanks(baseurl, result) {
	AnyBalance.trace('Попробуем получить Спасибо от сбербанка...');
	if (AnyBalance.isAvailable('spasibo')) {
		html = AnyBalance.requestGet(baseurl + '/PhizIC/private/async/loyalty.do');
		
		var href = getParam(html, null, null, /^\s*(https?:\/\/\S*)/i, replaceTagsAndSpaces);
		if (!href) {
			AnyBalance.trace('Не удаётся получить ссылку на спасибо от сбербанка: ' + html);
		} else {
			html = AnyBalance.requestGet(href);
			getParam(html, result, 'spasibo', /<span[^>]*balance__thanks-count[^>]*>([\s\S]*?)<\/span>/i, replaceTagsAndSpaces, parseBalance);
		}
	}
}

function parseSmallDateSilent(str) {
    return parseSmallDate(str, true);
}

function parseSmallDate(str, silent) {
    var dt = parseSmallDateInternal(str);
    if(!silent)
    	AnyBalance.trace('Parsed small date ' + new Date(dt) + ' from ' + str);
    return dt;
}

function parseSmallDateInternal(str) {
	//Дата
    var matches = str.match(/(\d+):(\d+)/) || [,0,0];
	var now = new Date();
	if (/сегодня/i.test(str)) {
		var date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +matches[1], +matches[2], 0);
		return date.getTime();
	} else if (/вчера/i.test(str)) {
		var date = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1, +matches[1], +matches[2], 0);
		return date.getTime();
	} else {
		var matches = /(\d+)[^\d]+(\d+)/i.exec(str);
		if (!matches) {
			AnyBalance.trace('Не удалось распарсить дату: ' + str);
		} else {
			var year = now.getFullYear();
			if (now.getMonth() + 1 < +matches[2])--year; //Если текущий месяц меньше месяца последней операции, скорее всего, то было за прошлый год
			var date = new Date(year, +matches[2] - 1, +matches[1]);
			return date.getTime();
		}
	}
}

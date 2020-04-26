
var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Charset': 'windows-1251,utf-8;q=0.7,*;q=0.3',
	'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
	'Connection': 'keep-alive',
	'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.76 Safari/537.36',
};

var urls = {
	'mkb'	: 'https://mkb.ru/exchange-rate',
	'sber'	: 'https://www.sberbank.ru/ru/quotes/currenciescards'
};

function getRates(banks, currs)
{
	var rates		= {};
	var prefs		= AnyBalance.getPreferences();
	
	var html		= AnyBalance.requestGet(urls["mkb"], g_headers);
	
	if(prefs.isDebug)
	{
		for(var i=0; i<html.length; i=i+790) AnyBalance.trace(html.substring(i, i+790));
	}
	
	var body 		= html.match(/<body(.+)>/gi)[0];
	trace('body =', body);
	//var xmlDoc	= $.parseXML(body);
	
	var jQ			= $(html);
	
	var cursy		= jQ.find('div.tabs__content.tabs__content_cards span').map(function(item, i)
	{
		trace('курсы МКБ (2):', i, item);
		
		return $(item).text();
	});
	
	AnyBalance.trace("cursy.length = " + cursy.length);
	
	for(var i=0; i<cursy.length; i++)
	{
		AnyBalance.trace('курсы МКБ (3):',i,"=",cursy[i]);
		
		//cursy[i]	= parseFloat( parseFloat( cursy[i] ).toFixed(4) );
		
		//AnyBalance.trace('курсы МКБ (2): ' + i + " = " + cursy[i]);
	}
	
	rates["mkb"]	= {
		"usd"	: [cursy[0], cursy[1]],
		"eur"	: [cursy[3], cursy[4]]
	};
	
	//AnyBalance.trace('курсы МКБ: ' + rates["mkb"]);



	/* 
	AnyBalance.setCookie('.aliexpress.ru', 'aep_usuc_f', 'site=rus&region=RU&b_locale=ru_RU&c_tp=' + cur);
	
	if(prefs.isDebug)
	{
		for(var i=0; i<html.length; i=i+790) AnyBalance.trace(html.substring(i, i+790));
	}
	
	var matches		= html.match(/class="price">\D*([\d\.,]+)/);
	AnyBalance.trace('Результаты парсинга цены: ' + matches); */
	
	return rates;
}

function main()
{
	AnyBalance.setDefaultCharset('utf-8');
	
	var prefs		= AnyBalance.getPreferences();
	var rates		= getRates();
	
	/* if(!priceFrom)
	{
		throw new AnyBalance.Error('Не удалось найти цену', true);
	} */

	var result = {
		success	: true,
		rate	: rates['mkb']['usd'][0]
	};
	
	if(AnyBalance.isAvailable('date'))
	{
		result.date = +new Date();
	}
	
	AnyBalance.setResult(result);
}

function trace(params)
{
	var args	= [].slice.call(arguments);
	
	AnyBalance.trace(args.join(" "));
}


var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Charset': 'windows-1251,utf-8;q=0.7,*;q=0.3',
	'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
	'Connection': 'keep-alive',
	'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.76 Safari/537.36',
};

var urls = {
	'mkb'	: 'https://mkb.ru/exchange-rate',
	'sber'	: 'https://www.sberbank.ru/portalserver/proxy/?pipe=shortCachePipe&url=http%3A%2F%2Flocalhost%2Frates-web%2FrateService%2Frate%2Fcurrent%3FregionId%3D77%26rateCategory%3Dcards%26currencyCode%3D978%26currencyCode%3D840'
	//'sber'	: 'https://www.sberbank.ru/ru/quotes/currenciescards'
};

function getRates(bank)
{
	var rates		= null;
	var prefs		= AnyBalance.getPreferences();
	var html		= AnyBalance.requestGet(urls[bank], g_headers);
	
	if(html)
	{
		//var body 	= html.match(/<body([\s\S]+)<\/body>/i)[0];
		
		if(prefs.isDebug) { for(var i=0; i<html.length; i=i+790) trace(html.substring(i, i+790)); }
		
		if(bank == 'sber')
		{
			var cursy 		= JSON.parse(html);
			var usd			= cursy.cards[840][0];
			var eur			= cursy.cards[978][0];
			
			rates			= {
					'usd'	: {buy:usd.buyValue, sell:usd.sellValue},
					'eur'	: {buy:eur.buyValue, sell:eur.sellValue}
			};
		}
		else if(bank == 'mkb')
		{
			var jQ			= $(html);
			var cursy		= jQ.find('div.tabs__content.tabs__content_cards span');						trace('Найдено курсов МКБ:', cursy.length);
			
			if(cursy.length)
			{
				cursy		= $.makeArray(cursy).map(function(item, i){ return parseFloat( $(item).text() ).toFixed(4); });
				rates		= {
					'usd'	: {buy:cursy[0], sell:cursy[1]},
					'eur'	: {buy:cursy[3], sell:cursy[4]}
				};
				cursy.forEach(function(item,i){ trace('Читаем курсы:', i, '=', cursy[i]); });
			}
		}
	} else {
		trace('Не удалось загрузить данные для банка', bank);
	}
	
	return rates;
}

function main()
{
	AnyBalance.setDefaultCharset('utf-8');
	
	var prefs		= AnyBalance.getPreferences();
	var result		= {success: true};
	var rates		= null;
	
	if(isAvailable('sber', prefs) && (rates = getRates('sber')))
	{		
		result['rate_sber_usd_buy']		= rates.usd.buy || null;
		result['rate_sber_usd_sell']	= rates.usd.sell || null;
		result['rate_sber_eur_buy']		= rates.eur.buy || null;
		result['rate_sber_eur_sell']	= rates.eur.sell || null;
	}
	
	if(isAvailable('mkb', prefs) && (rates = getRates('mkb')))
	{
		result['rate_mkb_usd_buy']		= rates.usd.buy || null;
		result['rate_mkb_usd_sell']		= rates.usd.sell || null;
		result['rate_mkb_eur_buy']		= rates.eur.buy || null;
		result['rate_mkb_eur_sell']		= rates.eur.sell || null;
	}
	
	AnyBalance.setResult(result);
}

function isAvailable(bank, prefs)
{
	trace("isAvailable", bank);
	
	for(var i in prefs)
	{
		trace("isAvailable", i, prefs[i], (i.indexOf('counter')>-1 && AnyBalance.isAvailable(prefs[i])));
		
		if(i.indexOf('counter') > -1 && prefs[i] == '--auto--') return true;
		
		if(i.indexOf('counter') > -1 && prefs[i].indexOf('rate_'+bank) > -1 && AnyBalance.isAvailable(prefs[i])) return true;
	}
	return false;
}

function trace(params)
{
	var args	= [].slice.call(arguments);
	
	AnyBalance.trace(args.join(" "));
}

'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { BadRequest, InvalidOrder, AuthenticationError, InsufficientFunds, BadSymbol, OrderNotFound, InvalidAddress } = require ('./base/errors');
const { TRUNCATE } = require ('./base/functions/number');

//  ---------------------------------------------------------------------------

module.exports = class gopax extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'gopax',
            'name': 'Gopax',
            'countries': [ 'KR' ], // South Korea
            'version': 'v1',
            'rateLimit': 50,
            'hostname': 'gopax.co.kr', // or 'gopax.com'
            'has': {
                'cancelOrder': true,
                'createMarketOrder': true,
                'createOrder': true,
                'fetchBalance': true,
                // 'fetchClosedOrders': true,
                'fetchCurrencies': true,
                'fetchDepositAddress': 'emulated',
                'fetchDepositAddresses': true,
                'fetchMarkets': true,
                // 'fetchMyTrades': true,
                'fetchOHLCV': true,
                // 'fetchOpenOrders': true,
                'fetchOrder': true,
                'fetchOrderBook': true,
                // 'fetchOrders': true,
                'fetchTicker': true,
                'fetchTickers': true,
                'fetchTime': true,
                'fetchTrades': true,
                // 'fetchTransactions': true,
            },
            'timeframes': {
                '1m': '1',
                '5m': '5',
                '30m': '30',
                '1d': '1440',
            },
            'urls': {
                'api': {
                    'public': 'https://api.{hostname}', // or 'https://api.gopax.co.kr'
                    'private': 'https://api.{hostname}',
                },
                'www': 'https://gopax.co.kr/',
                'doc': 'https://gopax.github.io/API/index.en.html',
                'fees': 'https://www.gopax.com/feeinfo',
            },
            'api': {
                'public': {
                    'get': [
                        'assets',
                        'trading-pairs',
                        'trading-pairs/{tradingPair}/ticker',
                        'trading-pairs/{tradingPair}/book',
                        'trading-pairs/{tradingPair}/trades',
                        'trading-pairs/{tradingPair}/stats',
                        'trading-pairs/stats',
                        'trading-pairs/{tradingPair}/candles',
                        'time',
                    ],
                },
                'private': {
                    'get': [
                        'balances',
                        'balances/{assetName}',
                        'orders',
                        'orders/{orderId}',
                        'orders/clientOrderId/{clientOrderId}',
                        'trades',
                        'deposit-withdrawal-status',
                        'crypto-deposit-addresses',
                        'crypto-withdrawal-addresses',
                    ],
                    'post': [
                        'orders',
                    ],
                    'delete': [
                        'orders/{orderId}',
                        'orders/clientOrderId/{clientOrderId}',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'percentage': true,
                    'tierBased': false,
                    'maker': 0.04 / 100,
                    'taker': 0.04 / 100,
                },
            },
            'exceptions': {
                'broad': {
                    'ERROR_INVALID_ORDER_TYPE': InvalidOrder,
                    'ERROR_INVALID_AMOUNT': InvalidOrder,
                    'ERROR_INVALID_TRADING_PAIR': BadSymbol, // Unlikely to be triggered, due to ccxt.gopax.js implementation
                    'No such order ID:': OrderNotFound,
                    'Not enough amount': InsufficientFunds,
                    'Forbidden order type': InvalidOrder,
                    'the client order ID will be reusable which order has already been completed or canceled': InvalidOrder,
                    'ERROR_NO_SUCH_TRADING_PAIR': BadSymbol, // Unlikely to be triggered, due to ccxt.gopax.js implementation
                    'ERROR_INVALID_ORDER_SIDE': InvalidOrder,
                    'ERROR_NOT_HEDGE_TOKEN_USER': InvalidOrder,
                    'ORDER_EVENT_ERROR_NOT_ALLOWED_BID_ORDER': InvalidOrder, // Triggered only when the exchange is locked
                    'ORDER_EVENT_ERROR_INSUFFICIENT_BALANCE': InsufficientFunds,
                    'Invalid option combination': InvalidOrder,
                    'No such client order ID': OrderNotFound,
                },
                'exact': {
                    '10155': AuthenticationError, // {"errorMessage":"Invalid API key","errorCode":10155}
                },
            },
            'options': {
                'createMarketBuyOrderRequiresPrice': true,
            },
        });
    }

    async fetchTime (params = {}) {
        const response = await this.publicGetTime (params);
        //
        //     {"serverTime":1608327726656}
        //
        return this.safeInteger (response, 'serverTime');
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetTradingPairs (params);
        //
        //     [
        //         {
        //             "id":1,
        //             "name":"ETH-KRW",
        //             "baseAsset":"ETH",
        //             "quoteAsset":"KRW",
        //             "baseAssetScale":8,
        //             "quoteAssetScale":0,
        //             "priceMin":1,
        //             "restApiOrderAmountMin":{
        //                 "limitAsk":{"amount":10000,"unit":"KRW"},
        //                 "limitBid":{"amount":10000,"unit":"KRW"},
        //                 "marketAsk":{"amount":0.001,"unit":"ETH"},
        //                 "marketBid":{"amount":10000,"unit":"KRW"},
        //             },
        //             "makerFeePercent":0.2,
        //             "takerFeePercent":0.2,
        //         },
        //     ]
        //
        const results = [];
        for (let i = 0; i < response.length; i++) {
            const market = response[i];
            const id = this.safeString (market, 'name');
            const numericId = this.safeInteger (market, 'id');
            const baseId = this.safeString (market, 'baseAsset');
            const quoteId = this.safeString (market, 'quoteAsset');
            const base = this.safeCurrencyCode (baseId);
            const quote = this.safeCurrencyCode (quoteId);
            const symbol = base + '/' + quote;
            const precision = {
                'price': this.safeInteger (market, 'quoteAssetScale'),
                'amount': this.safeInteger (market, 'baseAssetScale'),
            };
            const minimums = this.safeValue (market, 'restApiOrderAmountMin', {});
            const marketAsk = this.safeValue (minimums, 'marketAsk', {});
            const marketBid = this.safeValue (minimums, 'marketBid', {});
            results.push ({
                'id': id,
                'info': market,
                'numericId': numericId,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': this.safeString (market, 'baseAsset'),
                'quoteId': this.safeString (market, 'quoteAsset'),
                'active': true,
                'taker': this.safeFloat (market, 'takerFeePercent'),
                'maker': this.safeFloat (market, 'makerFeePercent'),
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': this.safeFloat (marketAsk, 'amount'),
                        'max': undefined,
                    },
                    'price': {
                        'min': this.safeFloat (market, 'priceMin'),
                        'max': undefined,
                    },
                    'cost': {
                        'min': this.safeFloat (marketBid, 'amount'),
                        'max': undefined,
                    },
                },
            });
        }
        return results;
    }

    async fetchCurrencies (params = {}) {
        const response = await this.publicGetAssets (params);
        //
        //     [
        //         {
        //             "id":"KRW",
        //             "name":"대한민국 원",
        //             "scale":0,
        //             "withdrawalFee":1000,
        //             "withdrawalAmountMin":5000
        //         },
        //         {
        //             "id":"ETH",
        //             "name":"이더리움",
        //             "scale":8,
        //             "withdrawalFee":0.03,
        //             "withdrawalAmountMin":0.015
        //         },
        //     ]
        //
        const results = [];
        for (let i = 0; i < response.length; i++) {
            const currency = response[i];
            const id = this.safeString (currency, 'id');
            const code = this.safeCurrencyCode (id);
            const name = this.safeString (currency, 'name');
            const fee = this.safeFloat (currency, 'withdrawalFee');
            const precision = this.safeFloat (currency, 'scale');
            results.push ({
                'id': id,
                'info': currency,
                'code': code,
                'name': name,
                'active': true,
                'fee': fee,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': this.safeFloat (currency, 'withdrawalAmountMin'),
                        'max': undefined,
                    },
                },
            });
        }
        return results;
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'tradingPair': market['id'],
            // 'level': 3, // 1 best bidask, 2 top 50 bidasks, 3 all bidasks
        };
        const response = await this.publicGetTradingPairsTradingPairBook (this.extend (request, params));
        //
        //     {
        //         "sequence":17691957,
        //         "bid":[
        //             ["17690499",25019000,0.00008904,"1608326468921"],
        //             ["17691894",25010000,0.4295,"1608326499940"],
        //             ["17691895",25009000,0.2359,"1608326499953"],
        //         ],
        //         "ask":[
        //             ["17689176",25024000,0.000098,"1608326442006"],
        //             ["17691351",25031000,0.206,"1608326490418"],
        //             ["17691571",25035000,0.3996,"1608326493742"],
        //         ]
        //     }
        //
        const nonce = this.safeInteger (response, 'sequence');
        const result = this.parseOrderBook (response, undefined, 'bid', 'ask', 1, 2);
        result['nonce'] = nonce;
        return result;
    }

    parseTicker (ticker, market = undefined) {
        //
        // fetchTicker
        //
        //     {
        //         "price":25087000,
        //         "ask":25107000,
        //         "askVolume":0.05837704,
        //         "bid":25087000,
        //         "bidVolume":0.00398628,
        //         "volume":350.09171591,
        //         "quoteVolume":8721016926.06529,
        //         "time":"2020-12-18T21:42:13.774Z",
        //     }
        //
        // fetchTickers
        //
        //     {
        //         "name":"ETH-KRW",
        //         "open":690500,
        //         "high":719500,
        //         "low":681500,
        //         "close":709500,
        //         "volume":2784.6081544,
        //         "time":"2020-12-18T21:54:50.795Z"
        //     }
        //
        const marketId = this.safeString (ticker, 'name');
        const symbol = this.safeSymbol (marketId, market, '-');
        const timestamp = this.parse8601 (this.safeString (ticker, 'time'));
        const open = this.safeFloat (ticker, 'open');
        const last = this.safeFloat2 (ticker, 'price', 'close');
        let change = undefined;
        let percentage = undefined;
        let average = undefined;
        if ((last !== undefined) && (open !== undefined)) {
            average = this.sum (last, open) / 2;
            change = last - open;
            if (open > 0) {
                percentage = change / open * 100;
            }
        }
        const baseVolume = this.safeFloat (ticker, 'volume');
        const quoteVolume = this.safeFloat (ticker, 'quoteVolume');
        const vwap = this.vwap (baseVolume, quoteVolume);
        return {
            'symbol': symbol,
            'info': ticker,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeFloat (ticker, 'high'),
            'low': this.safeFloat (ticker, 'low'),
            'bid': this.safeFloat (ticker, 'bid'),
            'bidVolume': this.safeFloat (ticker, 'bidVolume'),
            'ask': this.safeFloat (ticker, 'ask'),
            'askVolume': this.safeFloat (ticker, 'askVolume'),
            'vwap': vwap,
            'open': open,
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': change,
            'percentage': percentage,
            'average': average,
            'baseVolume': baseVolume,
            'quoteVolume': quoteVolume,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'tradingPair': market['id'],
        };
        const response = await this.publicGetTradingPairsTradingPairTicker (this.extend (request, params));
        //
        //     {
        //         "price":25087000,
        //         "ask":25107000,
        //         "askVolume":0.05837704,
        //         "bid":25087000,
        //         "bidVolume":0.00398628,
        //         "volume":350.09171591,
        //         "quoteVolume":8721016926.06529,
        //         "time":"2020-12-18T21:42:13.774Z",
        //     }
        //
        return this.parseTicker (response, market);
    }

    parseTickers (rawTickers, symbols = undefined) {
        const tickers = [];
        for (let i = 0; i < rawTickers.length; i++) {
            tickers.push (this.parseTicker (rawTickers[i]));
        }
        return this.filterByArray (tickers, 'symbol', symbols);
    }

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        const response = await this.publicGetTradingPairsStats (params);
        //
        //     [
        //         {
        //             "name":"ETH-KRW",
        //             "open":690500,
        //             "high":719500,
        //             "low":681500,
        //             "close":709500,
        //             "volume":2784.6081544,
        //             "time":"2020-12-18T21:54:50.795Z"
        //         }
        //     ]
        //
        return this.parseTickers (response, symbols);
    }

    parsePublicTrade (trade, market = undefined) {
        const timestamp = this.parse8601 (this.safeString (trade, 'time'));
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        let symbol = undefined;
        if ('symbol' in market) {
            symbol = this.safeString (market, 'symbol');
        }
        return {
            'info': trade,
            'id': this.safeString (trade, 'id'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': undefined, // Not mandatory to specify
            'type': undefined, // Not mandatory to specify
            'side': this.safeString (trade, 'side'),
            'takerOrMaker': undefined,
            'price': price,
            'amount': amount,
            'cost': price * amount,
            'fee': undefined,
        };
    }

    parsePrivateTrade (trade, market = undefined) {
        const timestamp = this.parse8601 (this.safeString (trade, 'timestamp'));
        const symbol = this.safeString (trade, 'tradingPairName').replace ('-', '/');
        const side = this.safeString (trade, 'side');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'baseAmount');
        let feeCurrency = symbol.slice (0, 3);
        if (side === 'sell') {
            feeCurrency = symbol.slice (4);
        }
        const fee = {
            'cost': this.safeFloat (trade, 'fee'),
            'currency': feeCurrency,
            'rate': undefined,
        };
        return {
            'info': trade,
            'id': this.safeString (trade, 'id'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': this.safeInteger (trade, 'orderId'),
            'type': undefined,
            'side': side,
            'takerOrMaker': this.safeString (trade, 'position'),
            'price': price,
            'amount': amount,
            'cost': price * amount,
            'fee': fee,
        };
    }

    parseTrade (trade, market = undefined) {
        //
        // public fetchTrades
        //
        //     {
        //         "time":"2020-12-19T12:17:43.000Z",
        //         "date":1608380263,
        //         "id":23903608,
        //         "price":25155000,
        //         "amount":0.0505,
        //         "side":"sell",
        //     }
        //
        // private fetchMyTrades
        //
        //     ...
        //
        const id = this.safeString (trade, 'id');
        const timestamp = this.parse8601 (this.safeString (trade, 'time'));
        const marketId = undefined;
        const symbol = this.safeSymbol (marketId, market, '-');
        const side = this.safeString (trade, 'side');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        let cost = undefined;
        if ((price !== undefined) && (amount !== undefined)) {
            cost = price * amount;
        }
        return {
            'info': trade,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': this.safeInteger (trade, 'orderId'),
            'type': undefined,
            'side': side,
            'takerOrMaker': this.safeString (trade, 'position'),
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': undefined,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'tradingPair': market['id'],
            // 'limit': limit,
            // 'pastmax': id, // read data older than this ID
            // 'latestmin': id, // read data newer than this ID
            // 'after': parseInt (since / 1000),
            // 'before': this.seconds (),
        };
        if (since !== undefined) {
            request['after'] = parseInt (since / 1000);
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetTradingPairsTradingPairTrades (this.extend (request, params));
        //
        //     [
        //         {"time":"2020-12-19T12:17:43.000Z","date":1608380263,"id":23903608,"price":25155000,"amount":0.0505,"side":"sell"},
        //         {"time":"2020-12-19T12:17:13.000Z","date":1608380233,"id":23903604,"price":25140000,"amount":0.019,"side":"sell"},
        //         {"time":"2020-12-19T12:16:49.000Z","date":1608380209,"id":23903599,"price":25140000,"amount":0.0072,"side":"sell"},
        //     ]
        //
        return this.parseTrades (response, market, since, limit);
    }

    parseOHLCV (ohlcv, market = undefined) {
        //
        //     [
        //         1606780800000, // timestamp
        //         21293000,      // low
        //         21300000,      // high
        //         21294000,      // open
        //         21300000,      // close
        //         1.019126,      // volume
        //     ]
        //
        return [
            this.safeInteger (ohlcv, 0),
            this.safeFloat (ohlcv, 3),
            this.safeFloat (ohlcv, 2),
            this.safeFloat (ohlcv, 1),
            this.safeFloat (ohlcv, 4),
            this.safeFloat (ohlcv, 5),
        ];
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        limit = (limit === undefined) ? 1024 : limit; // default 1024
        const request = {
            'tradingPair': market['id'],
            // 'start': since,
            // 'end': this.milliseconds (),
            'interval': this.timeframes[timeframe],
        };
        const duration = this.parseTimeframe (timeframe);
        if (since === undefined) {
            const end = this.milliseconds ();
            request['end'] = end;
            request['start'] = end - limit * duration * 1000;
        } else {
            request['start'] = since;
            request['end'] = this.sum (since, limit * duration * 1000);
        }
        const response = await this.publicGetTradingPairsTradingPairCandles (this.extend (request, params));
        //
        //     [
        //         [1606780800000,21293000,21300000,21294000,21300000,1.019126],
        //         [1606780860000,21237000,21293000,21293000,21263000,0.96800057],
        //         [1606780920000,21240000,21240000,21240000,21240000,0.11068715],
        //     ]
        //
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetBalances (params);
        //
        //     [
        //         {
        //             "asset": "KRW",                   // asset name
        //             "avail": 1759466.76,              // available amount to place order
        //             "hold": 16500,                    // outstanding amount on order books
        //             "pendingWithdrawal": 0,           // amount being withdrawan
        //             "lastUpdatedAt": "1600684352032", // balance last update time
        //         },
        //     ]
        //
        const result = { 'info': response };
        for (let i = 0; i < response.length; i++) {
            const balance = response[i];
            const currencyId = this.safeString (balance, 'asset');
            const code = this.safeCurrencyCode (currencyId);
            const hold = this.safeFloat (balance, 'hold');
            const pendingWithdrawal = this.safeFloat (balance, 'pendingWithdrawal');
            const account = this.account ();
            account['free'] = this.safeFloat (balance, 'avail');
            account['used'] = this.sum (hold, pendingWithdrawal);
            result[code] = account;
        }
        return this.parseBalance (result);
    }

    parseOrder (order, market = undefined) {
        const datetime = this.safeString (order, 'createdAt');
        const gopaxStatus = this.safeString (order, 'status');
        let status = 'open';
        if (gopaxStatus === 'cancelled') {
            status = 'canceled';
        } else if (gopaxStatus === 'completed') {
            status = 'closed';
        }
        const price = this.safeFloat (order, 'price');
        const amount = this.safeFloat (order, 'amount');
        const remaining = this.safeFloat (order, 'remaining');
        const filled = amount - remaining;
        const side = this.safeString (order, 'side');
        const symbol = this.safeString (order, 'tradingPairName').replace ('-', '/');
        const balanceChange = this.safeValue (order, 'balanceChange');
        let timeInForce = this.safeString (order, 'timeInForce');
        if (timeInForce !== undefined) {
            timeInForce = timeInForce.toUpperCase ();
        }
        const fee = {};
        if (side === 'buy') {
            const baseFee = this.safeValue (balanceChange, 'baseFee');
            fee['currency'] = symbol.slice (0, 3);
            fee['cost'] = this.sum (Math.abs (this.safeFloat (baseFee, 'taking')), Math.abs (this.safeFloat (baseFee, 'making')));
        } else {
            const quoteFee = this.safeValue (balanceChange, 'quoteFee');
            fee['currency'] = symbol.slice (4);
            fee['cost'] = this.sum (Math.abs (this.safeFloat (quoteFee, 'taking')), Math.abs (this.safeFloat (quoteFee, 'making')));
        }
        return {
            'id': this.safeString (order, 'id'),
            'clientOrderId': this.safeString (order, 'clientOrderId'),
            'datetime': datetime,
            'timestamp': this.parse8601 (datetime),
            'lastTradeTimestamp': this.parse8601 (this.safeString (order, 'updatedAt')),
            'status': status,
            'symbol': symbol,
            'type': this.safeString (order, 'type'),
            'timeInForce': timeInForce,
            'side': side,
            'price': price,
            'average': price,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'cost': filled * price,
            'trades': undefined,
            'fee': fee,
            'info': order,
        };
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let method = undefined;
        const clientOrderId = this.safeString (params, 'clientOrderId');
        params = this.omit (params, 'clientOrderId');
        const request = {};
        if (clientOrderId === undefined) {
            method = 'privateGetOrdersOrderId';
            request['orderId'] = id;
        } else {
            method = 'privateGetOrdersClientOrderIdClientOrderId';
            request['clientOrderId'] = clientOrderId;
        }
        const response = await this[method] (this.extend (request, params));
        //
        //     {
        //         "id": "453324",                          // order ID
        //         "clientOrderId": "zeckrw23456",          // client order ID (showed only when it exists)
        //         "status": "updated",                     // placed, cancelled, completed, updated, reserved
        //         "forcedCompletionReason": undefined,     // the reason in case it was canceled in the middle (protection or timeInForce)
        //         "tradingPairName": "ZEC-KRW",            // order book
        //         "side": "buy",                           // buy, sell
        //         "type": "limit",                         // limit, market
        //         "price": 1000000,                        // price
        //         "stopPrice": undefined,                  // stop price (showed only for stop orders)
        //         "amount": 4,                             // initial amount
        //         "remaining": 1,                          // outstanding amount
        //         "protection": "yes",                     // whether protection is activated (yes or no)
        //         "timeInForce": "gtc",                    // limit order's time in force (gtc/po/ioc/fok)
        //         "createdAt": "2020-09-25T04:06:20.000Z", // order placement time
        //         "updatedAt": "2020-09-25T04:06:29.000Z", // order last update time
        //         "balanceChange": {
        //             "baseGross": 3,                      // base asset balance's gross change (in ZEC for this case)
        //             "baseFee": {
        //                 "taking": 0,                     // base asset fee imposed as taker
        //                 "making": -0.0012                // base asset fee imposed as maker
        //             },
        //             "baseNet": 2.9988,                   // base asset balance's net change (in ZEC for this case)
        //             "quoteGross": -3000000,              // quote asset balance's gross change (in KRW for
        //             "quoteFee": {
        //                 "taking": 0,                     // quote asset fee imposed as taker
        //                 "making": 0                      // quote asset fee imposed as maker
        //             },
        //             "quoteNet": -3000000                 // quote asset balance's net change (in KRW for this case)
        //         }
        //     }
        //
        return this.parseOrder (response);
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = undefined;
        if (symbol !== undefined) {
            market = this.market (symbol);
        }
        if (!('includePast' in params)) {
            params['includePast'] = 'true';
        }
        const response = await this.privateGetOrders (params);
        return this.parseOrders (response, market, since, limit);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return await this.fetchOrders (symbol, since, limit, { 'includePast': false });
    }

    async fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const allOrders = await this.fetchOrders (symbol, since, undefined);
        const closedOrders = [];
        for (let i = 0; i < allOrders.length; i++) {
            if (this.safeString (allOrders[i], 'status') === 'closed') {
                closedOrders.push (allOrders[i]);
                if (limit !== undefined && closedOrders.length === limit) {
                    break;
                }
            }
        }
        return closedOrders;
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            // 'clientOrderId': 'test4321', // max 20 characters of [a-zA-Z0-9_-]
            'tradingPairName': market['id'],
            'side': side, // buy, sell
            'type': type, // limit, market
            // 'price': this.priceToPrecision (symbol, price),
            // 'stopPrice': this.priceToPrecision (symbol, stopPrice), // optional, becomes a stop order if set
            // 'amount': this.amountToPrecision (symbol, amount),
            // 'protection': 'no', // whether protection is activated
            // 'timeInForce': 'gtc', // gtc, po, ioc, fok
        };
        if (type === 'limit') {
            request['price'] = this.priceToPrecision (symbol, price);
            request['amount'] = this.amountToPrecision (symbol, amount);
        } else if (type === 'market') {
            // for market buy it requires the amount of quote currency to spend
            if (side === 'buy') {
                let total = amount;
                const createMarketBuyOrderRequiresPrice = this.safeValue (this.options, 'createMarketBuyOrderRequiresPrice', true);
                if (createMarketBuyOrderRequiresPrice) {
                    if (price === undefined) {
                        throw new InvalidOrder (this.id + " createOrder() requires the price argument with market buy orders to calculate total order cost (amount to spend), where cost = amount * price. Supply a price argument to createOrder() call if you want the cost to be calculated for you from price and amount, or, alternatively, add .options['createMarketBuyOrderRequiresPrice'] = false and supply the total cost value in the 'amount' argument");
                    }
                    total = price * amount;
                }
                const precision = market['precision']['price'];
                request['amount'] = this.decimalToPrecision (total, TRUNCATE, precision, this.precisionMode);
            } else {
                request['amount'] = this.amountToPrecision (symbol, amount);
            }
        }
        const clientOrderId = this.safeString (params, 'clientOrderId');
        if (clientOrderId !== undefined) {
            request['clientOrderId'] = clientOrderId;
            params = this.omit (params, 'clientOrderId');
        }
        const stopPrice = this.safeFloat (params, 'stopPrice');
        if (stopPrice !== undefined) {
            request['stopPrice'] = this.priceToPrecision (symbol, stopPrice);
            params = this.omit (params, 'stopPrice');
        }
        const timeInForce = this.safeStringLower (params, 'timeInForce');
        if (timeInForce !== undefined) {
            request['timeInForce'] = timeInForce;
            params = this.omit (params, 'timeInForce');
        }
        const response = await this.privatePostOrders (this.extend (request, params));
        //
        //     {
        //         "id": "453327",                          // order ID
        //         "clientOrderId": "test4321",             // client order ID (showed only when it exists)
        //         "status": "reserved",                    // placed, cancelled, completed, updated, reserved
        //         "forcedCompletionReason": undefined,     // the reason in case it was canceled in the middle (protection or timeInForce)
        //         "tradingPairName": "BCH-KRW",            // order book
        //         "side": "sell",                          // buy, sell
        //         "type": "limit",                         // limit, market
        //         "price": 11000000,                       // price
        //         "stopPrice": 12000000,                   // stop price (showed only for stop orders)
        //         "amount": 0.5,                           // initial amount
        //         "remaining": 0.5,                        // outstanding amount
        //         "protection": "no",                      // whether protection is activated (yes or no)
        //         "timeInForce": "gtc",                    // limit order's time in force (gtc/po/ioc/fok)
        //         "createdAt": "2020-09-25T04:51:31.000Z", // order placement time
        //         "balanceChange": {
        //             "baseGross": 0,                      // base asset balance's gross change (in BCH for this case)
        //             "baseFee": {
        //                 "taking": 0,                     // base asset fee imposed as taker
        //                 "making": 0                      // base asset fee imposed as maker
        //             },
        //             "baseNet": 0,                        // base asset balance's net change (in BCH for this case)
        //             "quoteGross": 0,                     // quote asset balance's gross change (in KRW for
        //             "quoteFee": {
        //                 "taking": 0,                     // quote asset fee imposed as taker
        //                 "making": 0                      // quote asset fee imposed as maker
        //             },
        //             "quoteNet": 0                        // quote asset balance's net change (in KRW for this case)
        //         }
        //     }
        //
        return this.parseOrder (response, market);
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        const clientOrderId = this.safeString (params, 'clientOrderId');
        let method = undefined;
        if (clientOrderId === undefined) {
            method = 'privateDeleteOrdersOrderId';
            request['orderId'] = id;
        } else {
            method = 'privateDeleteOrdersClientOrderIdClientOrderId';
            request['clientOrderId'] = clientOrderId;
            params = this.omit (params, 'clientOrderId');
        }
        const response = await this[method] (this.exted (request, params));
        //
        //     {}
        //
        const order = this.parseOrder (response);
        return this.extend (order, { 'id': id });
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = undefined;
        if (symbol !== undefined) {
            market = this.market (symbol);
        }
        const request = {};
        if (since !== undefined) {
            if (since > this.milliseconds ()) {
                throw new BadRequest ('Starting time should be in the past.');
            }
            request['after'] = Math.floor (since / 1000.0);
        }
        if (limit !== undefined && symbol === undefined) {
            if (limit <= 0) {
                throw new BadRequest ('Limit should be a positive number.');
            }
            request['limit'] = limit;
        }
        const response = await this.privateGetTrades (this.extend (request, params));
        return this.parseTrades (response, market, since, limit);
    }

    parseDepositAddress (depositAddress, currency = undefined) {
        //
        //     {
        //         "asset": "BTC",                                  // asset name
        //         "address": "1CwC2cMFu1jRQUBtw925cENbT1kctJBMdm", // deposit address
        //         "memoId": null,                                  // memo ID (showed only for assets using memo ID)
        //         "createdAt": 1594802312                          // deposit address creation time
        //     }
        //
        const address = this.safeString (depositAddress, 'address');
        const tag = this.safeString (depositAddress, 'memoId');
        const currencyId = this.safeString (depositAddress, 'asset');
        const code = this.safeCurrencyCode (currencyId);
        this.checkAddress (address);
        return {
            'currency': code,
            'address': address,
            'tag': tag,
            'info': depositAddress,
        };
    }

    parseDepositAddresses (addresses, codes = undefined) {
        let result = [];
        for (let i = 0; i < addresses.length; i++) {
            const address = this.parseDepositAddress (addresses[i]);
            result.push (address);
        }
        if (codes) {
            result = this.filterByArray (result, 'currency', codes);
        }
        return this.indexBy (result, 'currency');
    }

    async fetchDepositAddresses (codes = undefined, params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetCryptoDepositAddresses (params);
        //
        //     [
        //         {
        //             "asset": "BTC",                                  // asset name
        //             "address": "1CwC2cMFu1jRQUBtw925cENbT1kctJBMdm", // deposit address
        //             "memoId": null,                                  // memo ID (showed only for assets using memo ID)
        //             "createdAt": 1594802312                          // deposit address creation time
        //         },
        //     ]
        //
        return this.parseDepositAddresses (response, codes);
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const response = await this.fetchDepositAddresses (undefined, params);
        const address = this.safeValue (response, code);
        if (address === undefined) {
            throw new InvalidAddress (this.id + ' fetchDepositAddress() ' + code + ' address not found');
        }
        return address;
    }

    parseTransaction (transaction, currency = undefined) {
        const gopaxType = this.safeString (transaction, 'type');
        let type = 'deposit';
        if (gopaxType === 'crypto_withdrawal' || gopaxType === 'fiat_withdrawal') {
            type = 'withdrawal';
        }
        const amount = this.safeFloat (transaction, 'netAmount');
        const fee = this.safeFloat (transaction, 'feeAmount');
        let rate = 0;
        if (fee !== undefined && amount !== undefined && amount !== 0) {
            rate = fee / amount;
        }
        const timestamp = this.safeInteger (transaction, 'reviewStartedAt') * 1000;
        let updated = timestamp;
        if ('completedAt' in transaction) {
            const updatedAt = this.safeInteger (transaction, 'completedAt');
            if (updatedAt) {
                updated = updatedAt * 1000;
            }
        }
        let code = this.safeString (transaction, 'asset');
        if (!code) {
            code = currency.code;
        }
        return {
            'info': transaction,
            'id': this.safeInteger (transaction, 'id'),
            'txid': this.safeString (transaction, 'txId'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'addressFrom': this.safeString (transaction, 'sourceAddress'),
            'address': undefined,
            'addressTo': this.safeString (transaction, 'destinationAddress'),
            'tagFrom': this.safeString (transaction, 'sourceMemoId'),
            'tag': undefined,
            'tagTo': this.safeString (transaction, 'destinationMemoId'),
            'type': type,
            'amount': amount,
            'currency': code,
            'status': this.safeString (transaction, 'status'),
            'updated': updated,
            'comment': undefined,
            'fee': {
                'currency': code,
                'cost': fee,
                'rate': rate,
            },
        };
    }

    async fetchTransactions (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        // Invalid request handling
        if (since !== undefined && since > this.milliseconds ()) {
            throw new BadRequest ('Starting time should be in the past.');
        }
        if (limit !== undefined && limit <= 0) {
            throw new BadRequest ('Limit should be a positive integer.');
        }
        const request = {};
        if (since !== undefined) {
            request['after'] = since;
        }
        if (code === undefined) {
            request['limit'] = limit;
        }
        const response = await this.privateGetDepositWithdrawalStatus (this.extend (request, params));
        let currency = undefined;
        if (code !== undefined) {
            currency = this.safeCurrency (code.toLowerCase ());
        }
        return this.parseTransactions (response, currency, since, limit, params);
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) { // for authentication in private API calls
        const endpoint = '/' + this.implodeParams (path, params);
        let url = this.implodeParams (this.urls['api'][api], { 'hostname': this.hostname }) + endpoint;
        const query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            if (Object.keys (query).length) {
                url += '?' + this.urlencode (query);
            }
        } else if (api === 'private') {
            this.checkRequiredCredentials ();
            const timestamp = this.nonce ().toString ();
            let auth = 't' + timestamp + method + endpoint;
            if (method === 'POST') {
                headers['Content-Type'] = 'application/json';
                body = this.json (params);
                auth += body;
            } else if (endpoint === '/orders') {
                if (Object.keys (query).length) {
                    auth += '?' + this.urlencode (query);
                }
            }
            const rawSecret = this.base64ToBinary (this.secret);
            const signature = this.hmac (this.encode (auth), rawSecret, 'sha512', 'base64');
            headers = {
                'api-key': this.apiKey,
                'timestamp': timestamp,
                'signature': signature,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (code, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if (response === undefined) {
            return;
        }
        //
        //     {"errorMessage":"Invalid API key","errorCode":10155}
        //
        if (!Array.isArray (response)) {
            const errorCode = this.safeString (response, 'errorCode');
            const errorMessage = this.safeString (response, 'errorMessage');
            if (errorCode !== undefined) {
                const feedback = this.id + ' ' + body;
                this.throwExactlyMatchedException (this.exceptions['exact'], errorCode, feedback);
            } else if (errorMessage !== undefined) {
                const feedback = this.id + ' ' + body;
                this.throwBroadlyMatchedException (this.exceptions['broad'], body, feedback);
            }
        }
    }
};

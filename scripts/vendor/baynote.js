var BaynoteJSVersion = "Version: V1222-03";
var BaynoteIgnored = false;
var BN_READY_SIGNAL = "ReadySignal";
var Strategy = {
    "ScriptDOMInject": 2,
    "OnLoadInject": 3
};
if (typeof(baynote_globals) == "undefined") var baynote_globals = new Object();
baynote_globals.CommonResourceURL = "/baynote/tags3/common";
baynote_globals.CommonResourceID = "Common";
baynote_globals.PolicyResourceID = "Policy";
baynote_globals.CustomerStatus = "/baynote/customerstatus2";
baynote_globals.CommonScriptId = "commonScriptId";
if (typeof(baynote_inject_strategy) != "undefined") {
    baynote_globals.DefaultInjectStrategy = baynote_inject_strategy;
} else {
    baynote_globals.DefaultInjectStrategy = Strategy.ScriptDOMInject;
}
if (typeof(baynote_server_timeout) != "undefined") {
    baynote_globals.ServerTimeout = baynote_server_timeout;
} else {
    baynote_globals.ServerTimeout = undefined;
}
if (typeof(baynote_use_window_name) != "undefined") {
    baynote_globals.UseWindowName = baynote_use_window_name;
} else {
    baynote_globals.UseWindowName = false;
}
baynote_globals.waitForReady = false;
baynote_globals.checkStatus = false;
baynote_globals.keepTrail = false;
baynote_globals.trailLength = 5;
bnIsOpera = (navigator.userAgent.indexOf("Opera") >= 0);
bnIsSafari = (navigator.userAgent.indexOf("AppleWebKit") >= 0);
bnIsKonqueror = (navigator.userAgent.indexOf("Konqueror") >= 0);
bnIsKHTML = (bnIsSafari || bnIsKonqueror || navigator.userAgent.indexOf("KHTML") >= 0);
bnIsIE = (navigator.userAgent.indexOf("compatible") >= 0 && navigator.userAgent.indexOf("MSIE") >= 0 && !bnIsOpera);
bnIsMozilla = (navigator.userAgent.indexOf("Gecko") >= 0 && !bnIsKHTML);

function BNLog() {
    this.timeBase = new Date().getTime();
    this.lines = new Array();
    this.lastLine = "";
    this.repCount = 0;
}
BNLog.prototype.log = function(str) {
    if (str == this.lastLine) {
        ++this.repCount;
        return;
    }
    if (this.repCount > 0) {
        this.lines.push("___ ABOVE REPEATED " + this.repCount + " TIME" + ((this.repCount > 1) ? "S" : ""));
    }
    this.lastLine = str;
    this.repCount = 0;
    var elapsed = new Date().getTime() - this.timeBase;
    this.lines.push(elapsed + ": " + str);
};
BNLog.prototype.toString = function() {
    if (this.repCount > 0) {
        this.lines.push("___ ABOVE REPEATED " + this.repCount + " TIME" + ((this.repCount > 1) ? "S" : ""));
        this.lastLine = "";
        this.repCount = 0;
    }
    return this.lines.join("\n");
};
if (typeof(bnLog) == "undefined") {
    var bnLog = new BNLog();
}

function BNCriticalSectionQueue() {
    this.waitList = new Object();
    this.lastId = 0;
}
BNCriticalSectionQueue.prototype.issueId = function() {
    return ++this.lastId;
};
BNCriticalSectionQueue.prototype.enqueue = function(id, item) {
    this.waitList[id] = item;
};
BNCriticalSectionQueue.prototype.getWaiter = function(id) {
    return (id == null) ? null : this.waitList[id];
};
BNCriticalSectionQueue.prototype.firstWaiter = function() {
    return this.getWaiter(this.nextWaiterKeyAfter(null));
};
BNCriticalSectionQueue.prototype.nextWaiterAfter = function(id) {
    return this.getWaiter(this.nextWaiterKeyAfter(id));
};
BNCriticalSectionQueue.prototype.nextWaiterKeyAfter = function(id) {
    for (var currKey in this.waitList) {
        if (typeof(this.waitList[currKey]) != "object") continue;
        if (id == null) return currKey;
        if (id == currKey) id = null;
    }
    return null;
};
BNCriticalSectionQueue.prototype.nextPredecessor = function(target, start) {
    for (var currWaiter = start; currWaiter != null; currWaiter = this.nextWaiterAfter(currWaiter.id)) {
        if (currWaiter.enter || (currWaiter.number != 0 && (currWaiter.number < target.number || (currWaiter.number == target.number && currWaiter.id < target.id)))) {
            return currWaiter;
        }
    }
    return null;
};

function BNCriticalSection(csQueue) {
    this.csQueue = csQueue;
    this.debug = 1;
}
BNCriticalSection.prototype.enter = function(enterFunc) {
    this.enterFunc = enterFunc;
    this.id = this.csQueue.issueId();
    this.csQueue.enqueue(this.id, this);
    this.enter = true;
    this.number = (new Date()).getTime();
    this.enter = false;
    this.attempt(this.csQueue.firstWaiter());
};
BNCriticalSection.prototype.leave = function() {
    if (this.debug) bnLog.log("LEAVE " + this.id);
    this.number = 0;
};
BNCriticalSection.prototype.attempt = function(start) {
    var nextReady = this.csQueue.nextPredecessor(this, start);
    if (nextReady != null) {
        if (this.debug) bnLog.log("WAIT " + this.id);
        var me = this;
        return setTimeout(function() {
            me.attempt(nextReady);
        }, 50);
    }
    if (this.debug) bnLog.log("ENTER " + this.id);
    this.enterFunc();
};

function BNResourceManager(s) {
    this.csQueue = new BNCriticalSectionQueue();
    this.critSec = null;
    this.debug = 1;
    this.resources = new Object();
    this.waiting = new Object();
    this.onloadInjected = false;
    if (typeof(s) != "undefined") {
        this.strategy = s;
    } else {
        this.strategy = Strategy.ScriptDOMInject;
    }
}
BNResourceManager.prototype.getResource = function(rId) {
    return this.resources[rId];
};
BNResourceManager.prototype.loadResource = function(rId, rAddress, rType, timeout, failureFunc) {
    if (typeof(this.resources[rId]) != "undefined") return;
    this.resources[rId] = null;
    var critSec = new BNCriticalSection(this.csQueue);
    critSec.enter(function() {
        bnResourceManager.inject(rId, rAddress, rType, critSec, timeout, failureFunc);
    });
};
BNResourceManager.prototype.inject = function(rId, rAddress, rType, critSec, timeout, failureFunc) {
    this.critSec = critSec;
    if (this.debug) bnLog.log("INJECT " + this.critSec.id + " (" + rId + ")");
    if (typeof(rType) != "undefined" && rType != "script" && rType != "img") {
        bnLog.log("Unexpected resource type to loadResource: " + rType);
        return;
    }
    this.defaultInject(rId, rAddress, rType, timeout, failureFunc);
};
BNResourceManager.prototype.defaultInject = function(rId, rAddress, rType, timeout, failureFunc) {
    if (BaynoteIgnored) return;
    if (!rType || rType == "script") {
        if (this.strategy == Strategy.OnLoadInject) {
            if (rId == baynote_globals.CommonResourceID || rId == baynote_globals.PolicyResourceID) {
                if (!this.onloadInjected) {
                    var localInjectHandler = function() {
                        bnResourceManager.injectHandler(rId, rAddress, timeout, failureFunc);
                    };
                    if (window.addEventListener) window.addEventListener("load", localInjectHandler, false);
                    else if (window.attachEvent) window.attachEvent("onload", localInjectHandler);
                    else window["onload"] = localInjectHandler;
                    this.onloadInjected = true;
                    return;
                }
            }
        }
        this.injectHandler(rId, rAddress, timeout, failureFunc);
    } else if (rType == "img") {
        var img = document.createElement("IMG");
        var handler = function() {
            bnResourceManager.registerAndAddResource(rId, img);
        };
        if (img.addEventListener) img.addEventListener("load", handler, false);
        else if (img.attachEvent) img.attachEvent("onload", handler);
        else img["onload"] = handler;
        img.src = rAddress;
        img.style.display = "none";
        var bodyElement = document.getElementsByTagName('body');
        var ph = bodyElement[0];
        setTimeout(function() {
            if (ph != null) ph.appendChild(img);
        }, 5);
    }
};
BNResourceManager.prototype.injectHandler = function(rId, rAddress, timeout, failureFunc, scriptTag) {
    if (!this.resources[rId]) {
        if (typeof scriptTag != 'undefined') {
            scriptTag.src = '';
            if (typeof failureFunc == 'function') failureFunc();
            BaynoteIgnored = true;
            bnLog.log('FATAL: Treating Baynote as down. Resource \'' + rId + '\' took more than ' + timeout + ' mSec');
            return;
        }
        var scriptTag1 = document.createElement("script");
        setTimeout(function() {
            var head = document.getElementsByTagName("head");
            scriptTag1.language = "javascript";
            scriptTag1.src = rAddress;
            head[0].appendChild(scriptTag1);
        }, 50);
        if (timeout === undefined || timeout === null) {
            timeout = baynote_globals.ServerTimeout;
        }
        if (typeof timeout != 'undefined') {
            setTimeout(function() {
                bnResourceManager.injectHandler(rId, rAddress, timeout, failureFunc, scriptTag1);
            }, timeout);
        }
    }
};
BNResourceManager.prototype.waitForResource = function(rId, callbackCode, rAddress, rType, timeout, failureFunc) {
    with(this) {
        if (getResource(rId)) {
            this.runCallback(callbackCode);
        } else {
            if (typeof(waiting[rId]) == "undefined") waiting[rId] = new Array();
            var waitingList = waiting[rId];
            waitingList[waitingList.length] = callbackCode;
            if (rAddress) this.loadResource(rId, rAddress, rType, timeout, failureFunc);
        }
    }
};
BNResourceManager.prototype.wakeUpWaiting = function(rId) {
    with(this) {
        var waitingList = waiting[rId];
        if (!waitingList) return;
        for (var i = 0; i < waitingList.length; i++) {
            if (waitingList[i]) {
                var codeToEval = waitingList[i];
                waitingList[i] = null;
                if (this.debug && codeToEval) bnLog.log("CALLBACK " + rId + ": " + codeToEval);
                this.runCallback(codeToEval);
            }
        }
    }
};
BNResourceManager.prototype.registerAndAddResource = function(rId, resource) {
    if (this.debug) bnLog.log("REGISTER " + (this.critSec ? this.critSec.id : "") + " (" + rId + ")");
    this.resources[rId] = resource;
    this.wakeUpWaiting(rId);
    if (this.critSec) this.critSec.leave();
    setTimeout("bnResourceManager.wakeUpWaiting('" + rId + "')", 5000);
};
BNResourceManager.prototype.registerResource = function(rId) {
    this.registerAndAddResource(rId, true);
};
BNResourceManager.prototype.removeResource = function(rId) {
    this.resources[rId] = null;
    delete(this.resources[rId]);
};
BNResourceManager.prototype.runCallback = function(callback) {
    if (typeof(callback) == "function") callback();
    else alert("Invalid callback, type=" + typeof(callback));
};
if (typeof(bnResourceManager) == "undefined") {
    var bnResourceManager = new BNResourceManager(baynote_globals.DefaultInjectStrategy);
}

function BNSystem() {
    this.testServer = null;
}
BNSystem.prototype.getCookieValue = function(cookieName, cookieSubDomain) {
    if (!cookieSubDomain) cookieSubDomain = baynote_globals.cookieSubDomain;
    if (cookieSubDomain) cookieName += ("-" + cookieSubDomain);
    var sRE = "(?:; )?" + cookieName + "=([^;]*);?";
    var oRE = new RegExp(sRE);
    if (oRE.test(document.cookie)) {
        return decodeURIComponent(RegExp["$1"]);
    } else {
        return null;
    }
};
BNSystem.prototype.setCookie = function(cookieName, cookieValue, cookiePath, cookieExpires, cookieDomain, cookieSubDomain) {
    cookieValue = encodeURIComponent(cookieValue);
    if (cookieExpires == "NEVER") {
        var nowDate = new Date();
        nowDate.setFullYear(nowDate.getFullYear() + 500);
        cookieExpires = nowDate.toGMTString();
    } else if (cookieExpires == "SESSION") cookieExpires = "";
    if (cookiePath != "") cookiePath = ";Path=" + cookiePath;
    if (cookieExpires != "") cookieExpires = ";expires=" + cookieExpires;
    if (!cookieDomain) cookieDomain = (baynote_globals.cookieDomain) ? baynote_globals.cookieDomain : "";
    if (cookieDomain != "") cookieDomain = ";domain=" + cookieDomain;
    if (!cookieSubDomain) cookieSubDomain = baynote_globals.cookieSubDomain;
    if (cookieSubDomain) cookieName += ("-" + cookieSubDomain);
    var cookieStr = cookieName + "=" + cookieValue + cookieExpires + cookiePath + cookieDomain;
    if (cookieStr.length > 4096) return false;
    document.cookie = cookieStr;
    return true;
};
BNSystem.prototype.removeCookie = function(cookieName, cookieDomain) {
    this.setCookie(cookieName, "", "/", "Mon, 1 Jan 1990 00:00:00", cookieDomain);
};
BNSystem.prototype.getURLParam = function(name, url) {
    if (!url) var url = window.location.href;
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var match = regex.exec(url);
    if (!match) return null;
    else return match[1];
};
BNSystem.prototype.getTestServer = function() {
    if (this.testServer != null) return this.testServer;
    var testServer = this.getCookieValue("bn_test");
    if (!testServer) testServer = "";
    this.testServer = testServer;
    return testServer;
};
if (typeof(bnSystem) == "undefined") {
    var bnSystem = new BNSystem();
}

function BNTag(previousTag) {
    if (previousTag) {
        this.id = previousTag.id + 1;
        this.server = previousTag.server;
        this.customerId = previousTag.customerId;
        this.code = previousTag.code;
    } else this.id = 0;
    this.attrs = new Object();
    this.docAttrs = new Object();
    this.css = new Object();
}
BNTag.prototype.getCommonResourceId = function() {
    return baynote_globals.CommonResourceID;
};
BNTag.prototype.getCommonResourceAddress = function(obj) {
    var urlParams = '?';
    for (var i in obj) {
        if (i != 'server') {
            urlParams += i + '=' + encodeURIComponent(obj[i]) + '&';
        }
    }
    var cutLastAmp = urlParams.substring(0, urlParams.length - 1);
    var commonURL = this.server + baynote_globals.CommonResourceURL + cutLastAmp;
    return commonURL;
};
BNTag.prototype.getFailsafeResourceId = function() {
    return "Failsafe";
};
BNTag.prototype.getFailsafeResourceAddress = function() {
    var v = BaynoteJSVersion.split(" ")[1];
    var u = bnSystem.getCookieValue("bn_u");
    return (this.server + baynote_globals.CustomerStatus + "?customerId=" + this.customerId + "&code=" + this.code + "&v=" + v + "&u=" + u);
};
BNTag.prototype.getParam = function(name, defaultValue) {
    var value = this[name];
    if (typeof(value) == "undefined" || value == null) return defaultValue;
    else return value;
};
if (typeof(baynote_tag) == "undefined") {
    window["bn_tags"] = new Array();
    var baynote_tag = new BNTag(null);
}

function bnReadySignal() {
    bnResourceManager.registerResource(BN_READY_SIGNAL);
}

function bnCall(resName, methodName, methodArg) {
    var resource = bnResourceManager.getResource(resName);
    if (!resource) {
        bnResourceManager.waitForResource(resName, function() {
            bnCall(resName, methodName, methodArg);
        });
        return;
    }
    if (typeof(resource) != "object") {
        return;
    }
    var method = resource[methodName];
    if (typeof(method) != "function") {
        return;
    }
    method.call(resource, methodArg);
}

function bnWaitForCustomerStatus(callBack) {
    if (!bnCheckCustomerStatus()) {
        var failsafeId = baynote_tag.getFailsafeResourceId();
        bnResourceManager.waitForResource(failsafeId, function() {
            bnWaitForCustomerStatus(callBack);
        }, baynote_tag.getFailsafeResourceAddress(), "img");
        return;
    }
    bnResourceManager.runCallback(callBack);
}

function bnCheckCustomerStatus() {
    var failsafeId = baynote_tag.getFailsafeResourceId();
    if (bnResourceManager.getResource(failsafeId)) return true;
    else return false;
}
var BaynoteAPI = {};
BaynoteAPI.getURLParam = function(paramName, url) {
    return bnSystem.getURLParam(paramName, url);
};
BaynoteAPI.init = function(params) {
    if (!params || !params.server || !params.customerId || !params.code) {
        bnLog.log("ERROR: init called with insufficient arguments - needs server, customerId, code");
        return;
    }
    if (!params.timeout) {
        params.timeout = baynote_globals.ServerTimeout;
    }
    if (!params.onFailure) {
        params.onFailure = baynote_globals.onFailure;
    }
    var testServer = bnSystem.getTestServer();
    if (testServer) {
        var reValidTestServer = new RegExp("^https?://[^/]*\\.baynote\\.(com|net):?\\d*(/.*)?$");
        if (reValidTestServer.test(testServer)) params.server = testServer;
        else bnLog.log("Ignoring invalid test server \"" + testServer + "\"");
    }
    if (params.server) baynote_tag.server = params.server;
    if (params.customerId) baynote_tag.customerId = params.customerId;
    if (params.code) baynote_tag.code = params.code;
    var commonId = baynote_tag.getCommonResourceId();
    if (!bnResourceManager.getResource(commonId)) {
        bnResourceManager.waitForResource(commonId, function() {
            BaynoteAPI.init(params)
        }, baynote_tag.getCommonResourceAddress(params), "script", params.timeout, params.onFailure);
    } else {
        if (!BaynoteIgnored) {
            bnCommon.completePreload(params);
        }
    }
};
BaynoteAPI.execute = function(handlerName, handlerparams) {
    var commonId = baynote_tag.getCommonResourceId();
    if (typeof(bnResourceManager.getResource(commonId)) == 'undefined') {
        bnLog.log("WARN: common not loaded - exiting execute; consider calling init first");
        return;
    } else if (typeof bnCommon == 'undefined') {
        bnResourceManager.waitForResource(commonId, function() {
            BaynoteAPI.execute(handlerName, handlerparams);
        });
        return;
    }
    bnCommon.waitAndExecute(handlerName, handlerparams);
};
BaynoteAPI.executeAll = function(handlerparams) {
    var commonId = baynote_tag.getCommonResourceId();
    if (typeof(bnResourceManager.getResource(commonId)) == 'undefined') {
        bnLog.log("WARN: common not loaded - exiting executeAll; consider calling init first");
        return;
    } else if (typeof bnCommon == 'undefined') {
        bnResourceManager.waitForResource(commonId, function() {
            BaynoteAPI.executeAll(handlerparams);
        });
        return;
    }
    bnCommon.waitAndExecuteAll(handlerparams);
};
BaynoteAPI.call = function(handlerName, method, methodArgs, scopeObj) {
    var commonId = baynote_tag.getCommonResourceId();
    if (typeof(bnResourceManager.getResource(commonId)) == 'undefined') {
        bnLog.log("WARN: common not loaded - exiting call; consider calling init first");
        return;
    } else if (typeof bnCommon == 'undefined') {
        bnResourceManager.waitForResource(commonId, function() {
            BaynoteAPI.call(handlerName, method, methodArgs, scopeObj);
        });
        return;
    }
    bnCommon.finishCall(handlerName, method, methodArgs, scopeObj);
};
BaynoteAPI.isBaynoteIgnored = function() {
    return BaynoteIgnored;
};
BaynoteAPI.getCookieDomain = function() {
    var cDomain = "";
    var bn_locHref = window.location.href;
    var i = bn_locHref.indexOf('//');
    var s1 = bn_locHref.substring(i + 2);
    var j = s1.indexOf('/');
    if (j < 0)
        var s2 = s1;
    else
        var s2 = s1.substring(0, j);
    var k = s2.indexOf('.');
    var s3 = s2.substring(k + 1);
    s3;
    return cDomain = s3;
}
baynote_globals.cookieDomain = BaynoteAPI.getCookieDomain();
var preLoadObj = {};
var bn_locHref = window.location.href;
if (bn_locHref.indexOf("https://") == 0) {
    preLoadObj.server = "https://mystic-sport.baynote.net";
} else {
    preLoadObj.server = "http://mystic-sport.baynote.net";
}
preLoadObj.customerId = "mystic";
preLoadObj.code = "sport";
BaynoteAPI.init(preLoadObj);
if (typeof(baynoteObserver) == "undefined" || typeof(baynoteObserver) != "boolean" || baynoteObserver) {
    BaynoteAPI.execute("observer");
}
if (typeof(baynoteGuide) == "undefined" || typeof(baynoteGuide) != "boolean" || baynoteGuide) {
    BaynoteAPI.execute("recommendation");
}
if (typeof(baynoteDisableAjax) != "undefined" && typeof(baynoteDisableAjax) == "boolean" && !baynoteDisableAjax) {
    BaynoteAPI.execute("ajax");
}

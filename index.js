var EventEmitter = require('events').EventEmitter;
var scrubber = require('./lib/scrub');
var objectKeys = require('./lib/keys');
var forEach = require('./lib/foreach');
var isEnumerable = require('./lib/is_enum');

module.exports = function (cons, opts) {//调用dnode-protocol则返回一个新的Proto对象
    return new Proto(cons, opts);
};

(function () { // browsers bleh
    for (var key in EventEmitter.prototype) {
        Proto.prototype[key] = EventEmitter.prototype[key];
    }
})();//?????（1）

function Proto (cons, opts) {//cons为自带的方法，可缺
    var self = this;
    EventEmitter.call(self);//（1）,Proto继承自EventEmitter
    if (!opts) opts = {};//没有指定的话opts为{}
    
    self.remote = {};//远端方法
    self.callbacks = { local : [], remote : [] };//包含本地的回调函数和远端的回调函数，默认都为空
    self.wrap = opts.wrap;//wrap；包，缠绕？？？
    self.unwrap = opts.unwrap;
    
    self.scrubber = scrubber(self.callbacks.local);//本地的回调函数传给scrubber（准备生成方法交换消息）
    
    if (typeof cons === 'function') {//只提供了一个方法，instance即args，
        self.instance = new cons(self.remote, self);//？？？大概是转为{..}
    }
    else self.instance = cons || {};//不提供任何东西或提供多个（{。。。}）
}

Proto.prototype.start = function () {//发送方法交换消息
    this.request('methods', [ this.instance ]);
};

Proto.prototype.cull = function (id) {//向远端请求删除一个方法，本地的远端回调先删掉，同消息交换过程
    delete this.callbacks.remote[id];
    this.emit('request', {
        method : 'cull',
        arguments : [ id ]
    });
};

Proto.prototype.request = function (method, args) {
    var scrub = this.scrubber.scrub(args);//格式化要发送的消息，主要为建立方法与id链接
    
    this.emit('request', {//产生request事件并发送消息，{...}为发送的消息内容
        method : method,
        arguments : scrub.arguments,
        callbacks : scrub.callbacks,
        links : scrub.links
    });
};

Proto.prototype.handle = function (req) {//req为消息
    var self = this;
    var args = self.scrubber.unscrub(req, function (id) {//unscrub可以理解为消息解析，回调函数返回值将取代arg里的值
        //根据消息中的callbacks调用远端的方法
        //过程大概是这样的：取得callbacks里的每个id（转int），对每个id执行function（id）
        //执行完毕后结果(远端id对应的函数)存在根据callbacks里的id对应的值（path）找到其在arguments里的位置
        //即用函数取代[Function]占位符
        // {
        //     "method": 0,
        //     "arguments": [ "[Function]", "[Function]" ],
        //     "callbacks": { "0": ["0"], "1": ["1"] },
        //     "links": []
        // }
        if (self.callbacks.remote[id] === undefined) {//建立远端的回调函数
            // create a new function only if one hasn't already been created
            // for a particular id
            var cb = function () {
                self.request(id, [].slice.apply(arguments));//request = function (method, args),像远端发送方法调用,arguments为空
            };
            self.callbacks.remote[id] = self.wrap ? self.wrap(cb, id) : cb;///？？？wrap？？？
            return cb;
        }
        return self.unwrap
            ? self.unwrap(self.callbacks.remote[id], id)
            : self.callbacks.remote[id]
        ;
    });
    
    if (req.method === 'methods') {//对于方法交换消息，
        self.handleMethods(args[0]);//argments是这样的:[{...}]，所以是传进去{...}(方法列表,包括常量)
    }
    else if (req.method === 'cull') {//删除方法消息，删除的是本地给对方使用的回调
        forEach(args, function (id) {
            delete self.callbacks.local[id];//
        });
    }
    else if (typeof req.method === 'string') {//方法调用消息，函数名称直接调用
        if (isEnumerable(self.instance, req.method)) {//自身函数（instance）中包含有该方法
            self.apply(self.instance[req.method], args);//self.instance[req.method].apply(undefined,args)传入参数args
        }
        else {//自身没有这个方法，产生fail事件并抛出错误
            self.emit('fail', new Error(
                'request for non-enumerable method: ' + req.method
            ));
        }
    }
    else if (typeof req.method == 'number') {//通过id调用方法，在callbacks里寻找函数，其它与通过方法名称调用差不多
        var fn = self.callbacks.local[req.method];
        if (!fn) {
            self.emit('fail', new Error('no such method'));
        }
        else self.apply(fn, args);//fn.apply(undefined,args)
    }
};

Proto.prototype.handleMethods = function (methods) {
    var self = this;
    if (typeof methods != 'object') {
        methods = {};
    }
    
    // copy since assignment discards the previous refs
    forEach(objectKeys(self.remote), function (key) {//先删除之前记录的所有远端方法
        delete self.remote[key];
    });
    
    forEach(objectKeys(methods), function (key) {//再重新写入此次传过来的所有远端方法
        self.remote[key] = methods[key];
    });
    
    self.emit('remote', self.remote);//remote都准备好了，产生remote事件
    self.emit('ready');
};

Proto.prototype.apply = function (f, args) {
    try { f.apply(undefined, args) }
    catch (err) { this.emit('error', err) }
};

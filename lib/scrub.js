var traverse = require('traverse');
var objectKeys = require('./keys');
var forEach = require('./foreach');

function indexOf (xs, x) {//返回xs里第一个x的位置，没有x则返回-1
    if (xs.indexOf) return xs.indexOf(x);//xs本身带有indexOf函数（如string），直接调用
    for (var i = 0; i < xs.length; i++) if (xs[i] === x) return i;
    return -1;
}

// scrub callbacks out of requests in order to call them again later
module.exports = function (callbacks) {
    return new Scrubber(callbacks);
};

function Scrubber (callbacks) {
    this.callbacks = callbacks;
}

// Take the functions out and note them for future use
Scrubber.prototype.scrub = function (obj) {//obj类似于这样：[{x:function (f, g) {...},y:555}]
//返回类似于这样：
// {
//     arguments: [ { "x": "[Function]", "y": 555 } ],
//     callbacks: { "0": [ "0", "x" ] },
//     links: []
// }
    var self = this;
    var paths = {};
    var links = [];
    
    console.log("in scrub obj : ");
    console.dir(obj);
    var args = traverse(obj).map(function (node) {
        //traverse.map:对每个节点都执行function（node），并返回处理过的新对象
        //例子中node被认为是2个：function,555,所以键值对值只看值
        //如果想改变对象里的对应节点值，用this.update(值)
        //这里只对函数和循环结构进行处理
        console.log("in traverse : node : ");
        console.dir(node);
        if (typeof node === 'function') {
            //将方法替换成占位标识"[Function]"
            console.log("in if node : ");
            console.dir(node);
            var i = indexOf(self.callbacks, node);
            if (i >= 0 && !(i in paths)) {//callbacks里有该节点且该方法路径未在paths中记录，就只要把paths[id]处理就行
                // Keep previous function IDs only for the first function
                // found. This is somewhat suboptimal but the alternatives
                // are worse.
                paths[i] = this.path;//this.path是traverse的方法，是从根结点到当前节点的一个以字符串为键的数组
                //通过这个数组可以最终找到这个节点，如[{x:func1,y:func2},{x:func3,y:func4}]中如果遍历到func3,this.path为["1","x"]
            }
            else {//callbacks里没有该方法则要加入进去，以便以后调用，callbacks是一个数组，数组每个节点是方法，通过数组id可以找到这个方法
                var id = self.callbacks.length;
                self.callbacks.push(node);
                paths[id] = this.path;
                console.log("in i : "+i + "path : ");
                console.dir(this.path);//
            }
            
            this.update('[Function]');//不传递具体的function，用字符串'[function]'标记
        }
        else if (this.circular) {//links里存放循环应用的数据结构，标记为'[Circular]'?????(文中无标记，即无占位符)
            links.push({ from : this.circular.path, to : this.path });
            this.update('[Circular]');
        }
        // {没有看到[Circular]
        //     "method" : 12,
        //     "arguments" : [ { "a" : 5, "b" : [ { "c" : 5 } ] } ],
        //     "callbacks" : {},
        //     "links" : [ { "from" : [ 0 ], "to" : [ 0, "b", 1 ] } ]
        // }
    });
    return {
        arguments : args,
        callbacks : paths,
        links : links
    };
};
 
// Replace callbacks. The supplied function should take a callback id and
// return a callback of its own.
// {
//     arguments: [ { "x": "[Function]", "y": 555 } ],
//     callbacks: { "0": [ "0", "x" ] },
//     links: []
// }
Scrubber.prototype.unscrub = function (msg, f) {
    var args = msg.arguments || [];
    forEach(objectKeys(msg.callbacks || {}), function (sid) {
        //objectKeys返回键的数组，键为调用方法的id，对每个id
        var id = parseInt(sid, 10);
        var path = msg.callbacks[id];
        traverse.set(args, path, f(id));//根据path找到args里的元素，将f（id）值赋值给该元素
    });
// var data = { a : 5, b : [ { c : 5 } ] };
//     data.b.push(data);
//     fn(data);（1）
// {
//     "method" : 12,
//     "arguments" : [ { "a" : 5, "b" : [ { "c" : 5 } ] } ],
//     "callbacks" : {},
//     "links" : [ { "from" : [ 0 ], "to" : [ 0, "b", 1 ] } ]
// }    
    forEach(msg.links || [], function (link) {//还原循环结构
        var value = traverse.get(args, link.from);//取得from的值，即根据from里的path可以找到arg里对应的元素
                                                //例如这里[0]找到的是{ "a" : 5, "b" : [ { "c" : 5 } ] }
        traverse.set(args, link.to, value);//如（1）代码段，类似于该段的data.b.push(data)的意思，
    });
    
    return args;
};

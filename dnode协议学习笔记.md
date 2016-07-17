# 概述
dnode协议的消息采用JSON方式表示，以新行符进行消息分割。

消息类型有“方法交换”消息、“方法调用”消息和“方法删除”消息。

消息字段如下：

* method :: String 或 Integer（"cull"和"methods"为特定消息标识，对应“方法删除”、“方法交换”，方法名不应取这两个名字）
* arguments :: Array
* callbacks :: Object
* links :: Array

`method`的值标识消息类型，`arguments`一般是告诉对方“我有哪些方法”或调用方法传过去的参数，`callbacks`是使得可以通过id来调用对应的方法，这里也过滤了`arguments`里非方法的部分，`links`在`arguments`里有循环数据结构时才有内容。
# 举个例子
有如下一段代码：

	var proto = require('../');//proto现在只能模拟两端
    
    var s = proto({//server端提供x方法和y常量
	    x : function (f, g) {
		    setTimeout(function () { f(5) }, 200);
		    setTimeout(function () { g(6) }, 400);
	    },
	    y : 555
    });
    var c = proto();//client端什么都不提供
    
    s.on('request', c.handle.bind(c));//s发送消息，c端处理
    c.on('request', s.handle.bind(s));//c发送消息，s端处理
    
    c.on('remote', function (remote) {//收到s发送的消息后经过处理了（类似于解析好了），通过remote可以直接调用
	    function f (x) { console.log('f(' + x + ')') }
	    function g (x) { console.log('g(' + x + ')') }
	    remote.x(f, g);
    });
    
    s.start();//start的时候发送方法交换消息，触发request事件
    c.start();

在这个例子里，有“方法交换”和“方法调用”消息。

在调用`.start()`时，产生一个`'request'`事件，并发送“方法交换”消息。消息由`scrub`进行规范，同时`scrub`会更新`s.callbacks.local`（针对通过id的远端“方法调用”消息可以调用的函数，对应的，`s.instance`针对通过函数名的远端“方法调用”消息，与`.callbacks.remote`和`.remote`）。其中，s发出的“方法交换”消息如下：

    {
	    "method": "methods",
	    "arguments": [ { "x": "[Function]", "y": 555 } ],
	    "callbacks": { "0": [ "0", "x" ] },
	    "links": []
    }

`method`的值为“methods”就是告诉对方我这条消息是“方法交换”消息，而因为在“方法调用”消息里值为方法id或方法名称（string），所以方法名称不能为“methods”。

`arguments`的值为数组，在“方法交换”消息中`arguments`中只有一个元素（{...}），元素里包含s里声明的所有内容。在生成`arguments`时，通过将方法的具体内容替换成字符串`"[Function]"`来隐去方法的具体内容，即对于x来说将

		function (f, g) {
		    setTimeout(function () { f(5) }, 200);
		    setTimeout(function () { g(6) }, 400);
	    }

替换成了`"[Function]"`,而y对应的不是方法所以无改变。

`callbacks`是一个对象（{...}），对象存储键值对，键为id，值为id对应的方法的路径，通过这个路径可以找到方法在`arguments`里的位置。如s发送的消息中，`"0": [ "0", "x" ]`,键0为id，值为一个string的数组，根据路径数组0位置的`"0"`可找到`arguments`数组的0位置处的`{"x": "[Function]", "y": 555}`,而路径数组1位置的`"x"`可找到`"[Function]"`。

c发出的“方法交换”消息如下：

    {
	    "method": "methods",
	    "arguments": [ {} ],
	    "callbacks": {},
	    "links": []
    }

s发出的“方法交换”消息交由c来处理（`handle`），c收到消息后对消息进行解析（`unscrub`），更新`callbacks.remote`（通过id调用）和`remote`（通过方法调用，方法对应的id的`callbacks.remote`与`remote`内容相同），使得调用`remote.x`就是发送“方法调用”消息（调用`x`方法）（同调用`callbacks.remote[0]`）。c发出的“方法交换”消息也类似。

收到消息后会产生`remote`事件。此时经过“方法交换”消息后再处理`remote`的回调函数（如果有）。
所以对于如下一段代码：

	c.on('remote', function (remote) {//收到s发送的消息后经过处理了（类似于解析好了），通过remote可以直接调用
	    function f (x) { console.log('f(' + x + ')') }
	    function g (x) { console.log('g(' + x + ')') }
	    remote.x(f, g);
    });

回调函数的参数`remote`是c的`remote`，里面存放了由“方法交换”消息得来的键值对，键为s提供的方法名，值为一个函数，函数本身会执行发送“方法调用”消息（调用键名的函数，可传参）。所以`remote.x(f, g)`产生如下消息(因为发送了函数，产生过程更新`.callbacks.local`以便s请求调用发送的函数)：

    {
	    "method": 0,
	    "arguments": [ "[Function]", "[Function]" ],
	    "callbacks": { "0": ["0"], "1": ["1"] },
	    "links": []
    }

c产生的消息产生c的`request`事件，事件回调函数是s来处理这个消息。

s处理时与之前消息处理类似，先解析（`unscrub`），根据消息的`"callbacks"`更新了`callbacks.remote`（此时里面有两个元素,`.remote`只在“方法交换”时更新），然后执行其调用的方法,通过`.callbacks.local[0]`，即：

	function (f, g) {
		setTimeout(function () { f(5) }, 200);
		setTimeout(function () { g(6) }, 400);
	}

经过一定的延时后要执行`f(5)`或`g(6)`（更长时间后）需要向c发送“方法调用”消息,之前收到的“方法调用”消息里更新了`callbacks.remote`，可以通过id调用到对应的函数，`f(5)`发送消息：

	{
	    "method": 0,
	    "arguments": [5],
	    "callbacks": {},
	    "links": []
	}

c处理该消息就比较简单了，此时只要调用`c.callbacks.local[0]`得到`function f (x) { console.log('f(' + x + ')') }`，执行`f(5)`。

所以最终输出如下：

	f(5)
	g(6)

# 例子里没有的"方法删除"消息和links

通过调用`.cull(id)`可以删除`.callbacks.remote[id]`，即id对应的远端方法，并发送消息让对方也删除对应id的方法。

发送源码为：

	Proto.prototype.cull = function (id) {
	    delete this.callbacks.remote[id];
	    this.emit('request', {
	        method : 'cull',
	        arguments : [ id ]
	    });
	};

接收处理源码为：

	forEach(args, function (id) {
        delete self.callbacks.local[id];
    });

而`links`用于处理`arguments`里含有的循环结构。如：

	var data = { a : 5, b : [ { c : 5 } ] };
    data.b.push(data);
    fn(data);

当要发送的`arguments`里含有`data`的时候，在消息发送之前的处理函数`scrub`里对其进行处理，源码为：
	
	else if (this.circular) {
            links.push({ from : this.circular.path, to : this.path });
            this.update('[Circular]');
        }

对应消息为:

	{
	    "method" : 12,
	    "arguments" : [ { "a" : 5, "b" : [ { "c" : 5 } ,'[Circular]'] } ],
	    "callbacks" : {},
	    "links" : [ { "from" : [ 0 ], "to" : [ 0, "b", 1 ] } ]
	}

解析时根据`"from"`的值（路径）得到要循环的值（`{ "a" : 5, "b" : [ { "c" : 5 } ,'[Circular]'] }`），根据`"to"`的值（路径）得到循环的值应该放置的位置（`'[Circular]']`所处的位置），然后用循环值取代`'[Circular]']`，类似于执行`data.b.push(data)`。

引用本身????
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

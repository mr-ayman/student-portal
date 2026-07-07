(function () {
    if (document.getElementById("zohodeskasapscript")) {
        return;
    }

    var d = document;

    window.ZohoDeskAsapReady = function (callback) {
        var queue = window.ZohoDeskAsap__asyncalls =
            window.ZohoDeskAsap__asyncalls || [];

        if (window.ZohoDeskAsapReadyStatus) {
            if (callback) callback();
        } else {
            if (callback) queue.push(callback);
        }
    };

    var s = d.createElement("script");
    s.type = "text/javascript";
    s.id = "zohodeskasapscript";
    s.defer = true;

    s.src = "https://desk.zoho.in/portal/api/web/asapApp/268212000000380029?orgId=60076426050";

    var t = d.getElementsByTagName("script")[0];
    t.parentNode.insertBefore(s, t);
})();

let ziaLoaded = false;

function waitForASAP() {
    if (window.ZohoDeskAsap) {
        ziaLoaded = true;

        try {
            ZohoDeskAsap.invoke("hide", "app.launcher");
        } catch (e) {
            console.log("Launcher hide skipped");
        }

        console.log("ASAP / Zia loaded");
        return;
    }

    setTimeout(waitForASAP, 500);
}

waitForASAP();

document.addEventListener("DOMContentLoaded", function () {
    const ziaBtn = document.getElementById("ziaAgentBtn");

    if (ziaBtn) {
        ziaBtn.addEventListener("click", function () {
            openZia();
        });
    }
});

function openZia() {
    if (window.ZohoDeskAsap) {
        ZohoDeskAsap.invoke("open");
    } else {
        alert("Zia is loading. Please wait a few seconds and try again.");
    }
}
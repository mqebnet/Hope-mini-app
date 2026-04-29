document.addEventListener("DOMContentLoaded", () => {
    // Get the current page name from URL
    let currentPage = window.location.pathname.split("/").pop().toLowerCase(); 

    if (!currentPage || currentPage === "index.html") {
        currentPage = "home"; // Default to home if index.html or no file name
    } else {
        currentPage = currentPage.replace(".html", ""); // Remove .html extension
    }

    console.log("Current Page:", currentPage); // Debugging Log

    // Select all navigation buttons
    const navButtons = document.querySelectorAll(".nav-btn");

    navButtons.forEach(button => {
        if (button.getAttribute("data-page").toLowerCase() === currentPage) {
            button.classList.add("active"); // Highlight current tab
        } else {
            button.classList.remove("active"); // Remove active from others
        }
    });
});

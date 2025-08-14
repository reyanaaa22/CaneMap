    function generateFormId() {
        const year = new Date().getFullYear();
        const randomNum = Math.floor(100 + Math.random() * 900); // 3-digit random number
        return `#DR-${year}-${randomNum}`;
    }
    document.getElementById('formId').textContent = generateFormId();

    // Auto-fill Fullname and Contact if logged-in farmer
    document.addEventListener('DOMContentLoaded', () => {
        const fullnameInput = document.querySelector('input[placeholder="Enter your full name"]');
        const contactInput = document.querySelector('input[placeholder="+63 XXX XXX XXXX"]');
        const farmerName = localStorage.getItem('farmerName'); // Name saved during login
        const farmerContact = localStorage.getItem('farmerContact'); // Contact saved during login

        if (farmerName && fullnameInput) {
            fullnameInput.value = farmerName; // Auto-fill name
        }
        if (farmerContact && contactInput) {
            contactInput.value = farmerContact; // Auto-fill contact
        }
    });

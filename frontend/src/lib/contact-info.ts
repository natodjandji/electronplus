export const CONTACT_INFO = {
  phone: "+58 424-555.5990",
  whatsappHref: "https://wa.me/584245555990",
  email: "electronplusve@gmail.com",
  emailHref: "mailto:electronplusve@gmail.com",
  gmailComposeHref: "https://mail.google.com/mail/?view=cm&fs=1&to=electronplusve@gmail.com",
  hours: "Lun–Sáb 9am–5pm",
  /** The store, as the footer shows it (one line each). */
  addressLines: [
    "Calle Sucre, entre Uslar Pietri y Cecilio Acosta",
    "Edificio Leandro, planta baja, local D",
    "Chacao, Caracas 1060, Miranda",
  ],
  /** The same, in parts, for the homepage's structured data. */
  address: {
    street:
      "Calle Sucre, entre Uslar Pietri y Cecilio Acosta, Edificio Leandro, planta baja, local D",
    locality: "Chacao",
    region: "Miranda",
    postalCode: "1060",
    country: "VE",
  },
  mapsHref:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Edificio Leandro, Calle Sucre, Chacao, Caracas"),
};
